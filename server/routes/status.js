/**
 * status.js - Integration health check endpoint for J.A.R.V.I.S
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { requireAuth } = require('../middleware/auth');
const googleService = require('../services/google');
const telegramService = require('../services/telegram');
const config = require('../config');

/**
 * GET /api/status
 * Checks each integration for the logged-in user:
 * - calendar: calendar list with maxResults 1
 * - drive: about.get
 * - telegram: bot.getMe()
 * - ai: configured-key check without making an inference request
 * Returns: { calendar, drive, telegram, ai } each as 'online' | 'auth_expired' | 'unavailable'
 */
router.get('/api/status', requireAuth, async (req, res) => {
  const userId = req.session.userId;

  let calendarStatus = 'unavailable';
  let driveStatus = 'unavailable';
  let telegramStatus = 'unavailable';
  let aiStatus = 'unavailable';

  // 1. Calendar Health Check (cheap call: calendarList.list maxResults 1)
  try {
    const authClient = await googleService.getAuthedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.calendarList.list({ maxResults: 1 });
    calendarStatus = 'online';
  } catch (err) {
    const errMsg = (err.message || '').toLowerCase();
    if (err.code === 'auth_expired' || err.status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('expired')) {
      calendarStatus = 'auth_expired';
    } else {
      calendarStatus = 'unavailable';
    }
  }

  // 2. Drive Health Check (cheap call: about.get)
  try {
    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });
    await drive.about.get({ fields: 'user' });
    driveStatus = 'online';
  } catch (err) {
    const errMsg = (err.message || '').toLowerCase();
    if (err.code === 'auth_expired' || err.status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('expired')) {
      driveStatus = 'auth_expired';
    } else {
      driveStatus = 'unavailable';
    }
  }

  // 3. Telegram Health Check (bot.getMe)
  try {
    if (telegramService.bot && typeof telegramService.bot.getMe === 'function') {
      const me = await telegramService.bot.getMe();
      if (me && me.id) {
        telegramStatus = 'online';
      }
    }
  } catch (err) {
    telegramStatus = 'unavailable';
  }

  // 4. AI Health Check (configured-key check without making request)
  if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim() && !config.GEMINI_API_KEY.includes('your_')) {
    aiStatus = 'online';
  } else {
    aiStatus = 'unavailable';
  }

  res.json({
    calendar: calendarStatus,
    drive: driveStatus,
    telegram: telegramStatus,
    ai: aiStatus
  });
});

module.exports = router;
