/**
 * reminders.js - Reminder management API routes
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const remindersService = require('../services/reminders');

const router = express.Router();

/**
 * GET /api/reminders?scope=
 * List reminders for authenticated user (scopes: 'today', 'upcoming', 'all').
 */
router.get('/api/reminders', requireAuth, async (req, res, next) => {
  try {
    const reminders = await remindersService.listReminders(req.session.userId, req.query.scope);
    res.json({ reminders });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reminders
 * Create a new scheduled reminder.
 */
router.post('/api/reminders', requireAuth, async (req, res, next) => {
  try {
    const { text, due, dueISO } = req.body;
    const reminder = await remindersService.createReminder(
      req.session.userId,
      text,
      due || dueISO
    );
    res.status(201).json({ reminder });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reminders/:id/dismiss
 * Dismiss an active or fired reminder.
 */
router.post('/api/reminders/:id/dismiss', requireAuth, async (req, res, next) => {
  try {
    const reminder = await remindersService.dismissReminder(req.session.userId, req.params.id);
    res.json({ ok: true, reminder });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
