/**
 * google.js - Google OAuth 2.0 client and token lifecycle management
 */

const { google } = require('googleapis');
const config = require('../config');
const db = require('../db');
const cryptoService = require('./crypto');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive'
];

/**
 * Create a fresh OAuth2 client using server credentials.
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate Google OAuth consent URL with offline access and force consent to guarantee refresh token.
 * @param {string} state
 */
function getAuthUrl(state) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
}

/**
 * Load user credentials, build authenticated client, and attach automatic token refresh persistence.
 * @param {number} userId
 * @returns {Promise<import('googleapis').Auth.OAuth2Client>}
 */
async function getAuthedClient(userId) {
  const userResult = await db.query(
    'SELECT id, access_token, refresh_token, token_expiry FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    const err = new Error('User record not found');
    err.code = 'not_found';
    throw err;
  }

  const user = userResult.rows[0];
  if (!user.refresh_token) {
    const err = new Error('Google authorization expired or not present. Please reconnect.');
    err.code = 'auth_expired';
    throw err;
  }

  const client = createOAuth2Client();
  const decryptedAccessToken = user.access_token ? cryptoService.decrypt(user.access_token) : null;
  const decryptedRefreshToken = cryptoService.decrypt(user.refresh_token);

  client.setCredentials({
    access_token: decryptedAccessToken,
    refresh_token: decryptedRefreshToken,
    expiry_date: user.token_expiry ? new Date(user.token_expiry).getTime() : undefined
  });

  // Listen for refreshed tokens and save them securely in database
  client.on('tokens', async (newTokens) => {
    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (newTokens.access_token) {
        updates.push(`access_token = $${idx++}`);
        values.push(cryptoService.encrypt(newTokens.access_token));
      }
      if (newTokens.refresh_token) {
        updates.push(`refresh_token = $${idx++}`);
        values.push(cryptoService.encrypt(newTokens.refresh_token));
      }
      if (newTokens.expiry_date) {
        updates.push(`token_expiry = $${idx++}`);
        values.push(new Date(newTokens.expiry_date));
      }

      if (updates.length > 0) {
        values.push(userId);
        await db.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
          values
        );
      }
    } catch (err) {
      console.error('[GOOGLE] Failed to persist refreshed credentials:', err.message);
    }
  });

  // Intercept refresh errors and normalize invalid_grant to auth_expired
  const origGetAccessToken = client.getAccessToken.bind(client);
  client.getAccessToken = async () => {
    try {
      return await origGetAccessToken();
    } catch (err) {
      const isInvalidGrant =
        (err.message && err.message.toLowerCase().includes('invalid_grant')) ||
        (err.response?.data?.error === 'invalid_grant');

      if (isInvalidGrant) {
        const authErr = new Error('Google authorization expired. Please reconnect.');
        authErr.code = 'auth_expired';
        throw authErr;
      }
      throw err;
    }
  };

  return client;
}

module.exports = {
  SCOPES,
  createOAuth2Client,
  getAuthUrl,
  getAuthedClient
};
