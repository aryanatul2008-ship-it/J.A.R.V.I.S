/**
 * history.js - Action log history endpoint for J.A.R.V.I.S
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/history?limit=50
 * Returns the action_log rows for the logged-in user, newest first.
 */
router.get('/api/history', requireAuth, async (req, res, next) => {
  const userId = req.session.userId;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

  try {
    const result = await db.query(
      `SELECT id, tool, summary, status, error, created_at
       FROM action_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({
      history: result.rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
