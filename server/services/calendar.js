/**
 * calendar.js - Google Calendar integration service
 */

const { google } = require('googleapis');
const db = require('../db');
const googleService = require('./google');

/**
 * Normalize and map Google API errors to standard system codes.
 * @param {Error} err
 */
function handleGoogleError(err) {
  if (err.code === 'validation') {
    throw err;
  }

  const status = err.status || err.statusCode || (err.response && err.response.status);
  const errMsg = (err.message || '').toLowerCase();

  if (status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('auth_expired')) {
    const authErr = new Error('Google authorization expired. Please reconnect.');
    authErr.code = 'auth_expired';
    authErr.status = 401;
    throw authErr;
  }

  if (status === 403 || errMsg.includes('permission denied')) {
    const permErr = new Error(err.message || 'Access to Google Calendar was denied.');
    permErr.code = 'permission_denied';
    permErr.status = 403;
    throw permErr;
  }

  if (status === 404 || errMsg.includes('not found')) {
    const notFoundErr = new Error(err.message || 'The requested calendar event or resource was not found.');
    notFoundErr.code = 'not_found';
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  if (status >= 500 || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code)) {
    const unavailErr = new Error('Google Calendar service is temporarily unavailable.');
    unavailErr.code = 'integration_unavailable';
    unavailErr.status = 503;
    throw unavailErr;
  }

  throw err;
}

/**
 * Create a new event on the user's primary Google Calendar.
 * @param {number} userId
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.startISO
 * @param {string} [params.endISO]
 * @param {string} [params.description]
 */
async function createEvent(userId, { title, startISO, endISO, description }) {
  // Validate input parameters
  if (!title || typeof title !== 'string' || !title.trim()) {
    const err = new Error('Field "title" is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  if (!startISO) {
    const err = new Error('Field "start" is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  const startDate = new Date(startISO);
  if (isNaN(startDate.getTime())) {
    const err = new Error('Field "start" must be a valid ISO date string');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  let endDate;
  if (endISO) {
    endDate = new Date(endISO);
    if (isNaN(endDate.getTime())) {
      const err = new Error('Field "end" must be a valid ISO date string');
      err.code = 'validation';
      err.status = 400;
      throw err;
    }
    if (endDate <= startDate) {
      const err = new Error('Field "end" must be after field "start"');
      err.code = 'validation';
      err.status = 400;
      throw err;
    }
  } else {
    // Default duration: 60 minutes
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  }

  try {
    // Fetch user's preferred timezone
    const userRes = await db.query('SELECT timezone FROM users WHERE id = $1', [userId]);
    const timeZone = (userRes.rows[0] && userRes.rows[0].timezone) || 'UTC';

    const authClient = await googleService.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title.trim(),
        description: description || '',
        start: {
          dateTime: startDate.toISOString(),
          timeZone
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone
        }
      }
    });

    return {
      id: res.data.id,
      title: res.data.summary,
      start: res.data.start.dateTime || res.data.start.date,
      end: res.data.end.dateTime || res.data.end.date,
      description: res.data.description || '',
      htmlLink: res.data.htmlLink
    };
  } catch (err) {
    handleGoogleError(err);
  }
}

/**
 * List upcoming events from the user's primary Google Calendar.
 * Defaults from now to 14 days ahead.
 * @param {number} userId
 * @param {object} [options]
 * @param {string} [options.fromISO]
 * @param {string} [options.toISO]
 * @param {number} [options.max]
 */
async function listEvents(userId, { fromISO, toISO, max } = {}) {
  try {
    const from = fromISO ? new Date(fromISO) : new Date();
    if (isNaN(from.getTime())) {
      const err = new Error('Parameter "from" must be a valid ISO date string');
      err.code = 'validation';
      err.status = 400;
      throw err;
    }

    const to = toISO ? new Date(toISO) : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (isNaN(to.getTime())) {
      const err = new Error('Parameter "to" must be a valid ISO date string');
      err.code = 'validation';
      err.status = 400;
      throw err;
    }

    const maxResults = parseInt(max, 10) || 50;

    const authClient = await googleService.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const items = res.data.items || [];
    return items.map((e) => ({
      id: e.id,
      title: e.summary || '(Untitled Event)',
      start: (e.start && (e.start.dateTime || e.start.date)) || '',
      end: (e.end && (e.end.dateTime || e.end.date)) || '',
      description: e.description || '',
      htmlLink: e.htmlLink || ''
    }));
  } catch (err) {
    handleGoogleError(err);
  }
}

module.exports = {
  createEvent,
  listEvents
};
