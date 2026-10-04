/**
 * actions.js - Routes for confirming and cancelling consequential pending actions
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const telegramService = require('../services/telegram');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/actions/:id/confirm
 * Verify and execute pending action within 15 minutes of creation. Idempotent.
 */
router.post('/api/actions/:id/confirm', requireAuth, async (req, res, next) => {
  const actionId = req.params.id;
  const userId = req.session.userId;

  if (!UUID_REGEX.test(actionId)) {
    return res.status(400).json({
      error: 'Invalid action ID format',
      code: 'validation'
    });
  }

  try {
    // Atomically transition status from pending to confirmed if within 15 minutes
    const updateRes = await db.query(
      `UPDATE pending_actions
       SET status = 'confirmed'
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'
         AND created_at >= NOW() - INTERVAL '15 minutes'
       RETURNING id, tool, args, summary, created_at`,
      [actionId, userId]
    );

    if (updateRes.rows.length === 0) {
      // Check why update matched 0 rows
      const checkRes = await db.query(
        'SELECT id, status, created_at FROM pending_actions WHERE id = $1 AND user_id = $2',
        [actionId, userId]
      );

      if (checkRes.rows.length === 0) {
        return res.status(404).json({
          error: 'Pending action not found',
          code: 'not_found'
        });
      }

      const existing = checkRes.rows[0];
      if (existing.status !== 'pending') {
        return res.status(400).json({
          error: `Action is already ${existing.status}`,
          code: 'already_processed'
        });
      }

      return res.status(400).json({
        error: 'Pending action has expired (exceeded 15 minutes limit)',
        code: 'expired'
      });
    }

    const action = updateRes.rows[0];
    const args = typeof action.args === 'string' ? JSON.parse(action.args) : action.args;

    if (action.tool === 'send_telegram_message') {
      // Execute the Telegram message dispatch
      const commsRow = await telegramService.sendMessage(userId, args.contactId, args.message);

      // Record success in action_log
      await db.query(
        `INSERT INTO action_log (user_id, tool, summary, status)
         VALUES ($1, 'send_telegram_message', $2, 'success')`,
        [userId, action.summary]
      );

      return res.json({
        ok: true,
        actionId: action.id,
        comms: commsRow
      });
    }

    res.json({ ok: true, actionId: action.id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/actions/:id/cancel
 * Mark pending action as cancelled and record in comms and action_log.
 */
router.post('/api/actions/:id/cancel', requireAuth, async (req, res, next) => {
  const actionId = req.params.id;
  const userId = req.session.userId;

  if (!UUID_REGEX.test(actionId)) {
    return res.status(400).json({
      error: 'Invalid action ID format',
      code: 'validation'
    });
  }

  try {
    const updateRes = await db.query(
      `UPDATE pending_actions
       SET status = 'cancelled'
       WHERE id = $1
         AND user_id = $2
         AND status = 'pending'
       RETURNING id, tool, args, summary`,
      [actionId, userId]
    );

    if (updateRes.rows.length === 0) {
      const checkRes = await db.query(
        'SELECT id, status FROM pending_actions WHERE id = $1 AND user_id = $2',
        [actionId, userId]
      );

      if (checkRes.rows.length === 0) {
        return res.status(404).json({
          error: 'Pending action not found',
          code: 'not_found'
        });
      }

      const existing = checkRes.rows[0];
      return res.status(400).json({
        error: `Action is already ${existing.status}`,
        code: 'already_processed'
      });
    }

    const action = updateRes.rows[0];
    const args = typeof action.args === 'string' ? JSON.parse(action.args) : action.args;

    if (action.tool === 'send_telegram_message') {
      // Write a comms record with status 'cancelled'
      await db.query(
        `INSERT INTO comms (user_id, contact_id, recipient_name, body, status, error)
         VALUES ($1, $2, $3, $4, 'cancelled', 'Cancelled by user')`,
        [userId, args.contactId || null, args.recipient || 'Contact', args.message || '']
      );
    }

    // Write action_log entry
    await db.query(
      `INSERT INTO action_log (user_id, tool, summary, status)
       VALUES ($1, $2, $3, 'cancelled')`,
      [userId, action.tool, action.summary]
    );

    res.json({ ok: true, status: 'cancelled', actionId: action.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
