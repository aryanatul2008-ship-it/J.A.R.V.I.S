/**
 * calendar.js - Google Calendar API routes
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const calendarService = require('../services/calendar');

const router = express.Router();

/**
 * GET /api/calendar/events
 * List upcoming events between from and to ISO dates.
 */
router.get('/api/calendar/events', requireAuth, async (req, res, next) => {
  try {
    const { from, to, max } = req.query;
    const events = await calendarService.listEvents(req.session.userId, {
      fromISO: from,
      toISO: to,
      max
    });
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/events
 * Create an event on the user's primary calendar.
 */
router.post('/api/calendar/events', requireAuth, async (req, res, next) => {
  try {
    const { title, start, end, startISO, endISO, description } = req.body;
    const event = await calendarService.createEvent(req.session.userId, {
      title,
      startISO: start || startISO,
      endISO: end || endISO,
      description
    });
    res.status(201).json({ event });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
