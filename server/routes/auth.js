/**
 * auth.js - Google OAuth 2.0 authentication and user profile routes
 */

const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');

const config = require('../config');
const db = require('../db');
const googleService = require('../services/google');
const cryptoService = require('../services/crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Validate IANA timezone string against the runtime Intl database.
 * @param {string} tz
 * @returns {boolean}
 */
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * GET /auth/google
 * Initiates Google OAuth2 consent redirect.
 */
router.get('/auth/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  req.session.save((err) => {
    if (err) {
      console.error('[AUTH] Failed to save OAuth state to session:', err.message);
      return res.status(500).json({ error: 'Session error', code: 'session_error' });
    }
    const authUrl = googleService.getAuthUrl(state);
    res.redirect(authUrl);
  });
});

/**
 * GET /auth/google/callback
 * Handles OAuth callback, exchanges authorization code, upserts user, and stores tokens.
 */
router.get('/auth/google/callback', async (req, res, next) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[AUTH] Google returned OAuth error:', oauthError);
    return res.redirect(`/?error=${encodeURIComponent(oauthError)}`);
  }

  if (!state || state !== req.session.oauthState) {
    return res.status(400).json({
      error: 'Invalid or missing OAuth state parameter',
      code: 'invalid_state'
    });
  }

  // Clear state once validated
  delete req.session.oauthState;

  try {
    const client = googleService.createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Retrieve user profile information from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id) {
      throw new Error('Google profile missing user identifier');
    }

    const encryptedAccess = tokens.access_token ? cryptoService.encrypt(tokens.access_token) : null;
    const encryptedRefresh = tokens.refresh_token ? cryptoService.encrypt(tokens.refresh_token) : null;
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Check if user already exists in database
    const existingUserRes = await db.query(
      'SELECT id, refresh_token FROM users WHERE google_id = $1',
      [profile.id]
    );

    let userId;

    if (existingUserRes.rows.length > 0) {
      const existingUser = existingUserRes.rows[0];
      userId = existingUser.id;

      // Preserve existing refresh token if Google omits it in subsequent logins
      const finalRefreshToken = encryptedRefresh || existingUser.refresh_token;

      await db.query(
        `UPDATE users
         SET email = $1, name = $2, access_token = $3, refresh_token = $4, token_expiry = $5
         WHERE id = $6`,
        [profile.email, profile.name, encryptedAccess, finalRefreshToken, tokenExpiry, userId]
      );
    } else {
      // Generate unique invite code for Telegram account linking
      const inviteCode = crypto.randomBytes(6).toString('hex');

      const insertRes = await db.query(
        `INSERT INTO users (google_id, email, name, access_token, refresh_token, token_expiry, invite_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [profile.id, profile.email, profile.name, encryptedAccess, encryptedRefresh, tokenExpiry, inviteCode]
      );
      userId = insertRes.rows[0].id;
    }

    // Persist user ID to session
    req.session.userId = userId;
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/logout
 * Destroys current session and clears cookie.
 */
router.post('/auth/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

/**
 * GET /api/me
 * Returns current authenticated user profile and invite link.
 */
router.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const userRes = await db.query(
      'SELECT id, name, email, timezone, telegram_chat_id, invite_code FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        error: 'User not found',
        code: 'not_authenticated'
      });
    }

    const u = userRes.rows[0];
    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      timezone: u.timezone || 'UTC',
      telegramLinked: Boolean(u.telegram_chat_id),
      inviteCode: u.invite_code,
      inviteLink: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${u.invite_code}`,
      selfInviteLink: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=self_${u.invite_code}`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/me/timezone
 * Updates authenticated user's preferred IANA timezone.
 */
router.post('/api/me/timezone', requireAuth, async (req, res, next) => {
  const { timezone } = req.body;

  if (!isValidTimezone(timezone)) {
    return res.status(400).json({
      error: 'Invalid IANA timezone identifier',
      code: 'invalid_timezone'
    });
  }

  try {
    await db.query(
      'UPDATE users SET timezone = $1 WHERE id = $2',
      [timezone, req.session.userId]
    );
    res.json({ ok: true, timezone });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
