/**
 * telegram.js - Express routes for Telegram contacts and transmission history
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const telegramService = require('../services/telegram');

/**
 * GET /api/contacts
 * Returns all contacts for the authenticated user, ordered by name.
 */
router.get('/api/contacts', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, aliases, chat_id, created_at
       FROM contacts
       WHERE user_id = $1
       ORDER BY name ASC`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/contacts/:id
 * Rename and edit aliases for a contact.
 */
router.patch('/api/contacts/:id', requireAuth, async (req, res, next) => {
  const contactId = parseInt(req.params.id, 10);
  if (isNaN(contactId)) {
    return res.status(400).json({
      error: 'Invalid contact ID',
      code: 'validation'
    });
  }

  const { name, aliases } = req.body;

  let cleanName = null;
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        error: 'Name cannot be empty',
        code: 'validation'
      });
    }
    cleanName = name.trim();
  }

  let cleanAliases = null;
  if (aliases !== undefined) {
    if (Array.isArray(aliases)) {
      cleanAliases = aliases
        .map((a) => (typeof a === 'string' ? a.trim() : ''))
        .filter(Boolean);
    } else if (typeof aliases === 'string') {
      cleanAliases = aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
    } else {
      return res.status(400).json({
        error: 'Aliases must be an array or comma-separated string',
        code: 'validation'
      });
    }
  }

  try {
    const checkRes = await db.query(
      'SELECT id, name, aliases FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, req.session.userId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found',
        code: 'not_found'
      });
    }

    const current = checkRes.rows[0];
    const finalName = cleanName !== null ? cleanName : current.name;
    const finalAliases = cleanAliases !== null ? cleanAliases : current.aliases;

    const updateRes = await db.query(
      `UPDATE contacts
       SET name = $1, aliases = $2
       WHERE id = $3 AND user_id = $4
       RETURNING id, name, aliases, chat_id, created_at`,
      [finalName, finalAliases, contactId, req.session.userId]
    );

    res.json(updateRes.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete a contact for the authenticated user.
 */
router.delete('/api/contacts/:id', requireAuth, async (req, res, next) => {
  const contactId = parseInt(req.params.id, 10);
  if (isNaN(contactId)) {
    return res.status(400).json({
      error: 'Invalid contact ID',
      code: 'validation'
    });
  }

  try {
    const deleteRes = await db.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [contactId, req.session.userId]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found',
        code: 'not_found'
      });
    }

    res.json({ ok: true, id: contactId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/comms
 * Returns the latest 50 comms records for the user, newest first.
 */
router.get('/api/comms', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, contact_id, recipient_name, body, status, error, created_at
       FROM comms
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comms
 * Send a message to a contact via Telegram.
 */
router.post('/api/comms', requireAuth, async (req, res, next) => {
  const { contactId, text } = req.body;

  if (!contactId || isNaN(parseInt(contactId, 10))) {
    return res.status(400).json({
      error: 'Valid contactId is required',
      code: 'validation'
    });
  }

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({
      error: 'Message text is required',
      code: 'validation'
    });
  }

  try {
    const commsRow = await telegramService.sendMessage(
      req.session.userId,
      parseInt(contactId, 10),
      text.trim()
    );
    res.json(commsRow);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
