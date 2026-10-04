/**
 * reminders.js - Reminder creation, retrieval, and dismissal service
 */

const db = require('../db');

/**
 * Create a new reminder scheduled for a future timestamp.
 * @param {number} userId
 * @param {string} text
 * @param {string} dueISO
 */
async function createReminder(userId, text, dueISO) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    const err = new Error('Field "text" is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  if (!dueISO) {
    const err = new Error('Field "due" is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  const dueDate = new Date(dueISO);
  if (isNaN(dueDate.getTime())) {
    const err = new Error('Field "due" must be a valid ISO date string');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  if (dueDate.getTime() <= Date.now()) {
    const err = new Error('Field "due" must be a future time');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  try {
    const res = await db.query(
      `INSERT INTO reminders (user_id, text, due_at, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, user_id, text, due_at, status, created_at`,
      [userId, text.trim(), dueDate.toISOString()]
    );

    return res.rows[0];
  } catch (err) {
    console.error('[REMINDERS] Failed creating reminder:', err.message);
    throw err;
  }
}

/**
 * List reminders for a user based on requested scope.
 * @param {number} userId
 * @param {'today' | 'upcoming' | 'all'} [scope='upcoming']
 */
async function listReminders(userId, scope = 'upcoming') {
  try {
    let queryText = '';
    const params = [userId];

    if (scope === 'today') {
      queryText = `
        SELECT r.id, r.user_id, r.text, r.due_at, r.status, r.created_at
        FROM reminders r
        LEFT JOIN users u ON u.id = r.user_id
        WHERE r.user_id = $1
          AND r.status = 'active'
          AND DATE(r.due_at AT TIME ZONE COALESCE(u.timezone, 'UTC')) = DATE(NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC'))
        ORDER BY r.due_at ASC
      `;
    } else if (scope === 'all') {
      queryText = `
        SELECT id, user_id, text, due_at, status, created_at
        FROM reminders
        WHERE user_id = $1
        ORDER BY due_at DESC
      `;
    } else {
      // Default: 'upcoming' active reminders
      queryText = `
        SELECT id, user_id, text, due_at, status, created_at
        FROM reminders
        WHERE user_id = $1
          AND status = 'active'
        ORDER BY due_at ASC
      `;
    }

    const res = await db.query(queryText, params);
    return res.rows;
  } catch (err) {
    console.error('[REMINDERS] Failed listing reminders:', err.message);
    throw err;
  }
}

/**
 * Dismiss an active or fired reminder.
 * @param {number} userId
 * @param {number|string} id
 */
async function dismissReminder(userId, id) {
  try {
    const res = await db.query(
      `UPDATE reminders
       SET status = 'dismissed'
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, text, due_at, status, created_at`,
      [parseInt(id, 10), userId]
    );

    if (res.rows.length === 0) {
      const err = new Error(`Reminder ${id} not found or unauthorized`);
      err.code = 'not_found';
      err.status = 404;
      throw err;
    }

    return res.rows[0];
  } catch (err) {
    if (err.code !== 'not_found') {
      console.error('[REMINDERS] Failed dismissing reminder:', err.message);
    }
    throw err;
  }
}

module.exports = {
  createReminder,
  listReminders,
  dismissReminder
};
