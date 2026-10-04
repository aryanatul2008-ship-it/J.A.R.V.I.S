/**
 * telegram.js - Telegram Bot integration service
 * Handles bot initialization in polling mode, invite-code registration,
 * contact resolution, and message transmission.
 */

const TelegramPkg = require('node-telegram-bot-api');
const config = require('../config');
const db = require('../db');

const TelegramBot = TelegramPkg.Bot || TelegramPkg;

let bot = null;
let isInitialized = false;

/**
 * Initialize Telegram bot in polling mode.
 * Safe to call multiple times; starts only once.
 */
function init() {
  if (isInitialized) {
    return bot;
  }
  isInitialized = true;

  if (!config.TELEGRAM_BOT_TOKEN || config.TELEGRAM_BOT_TOKEN.includes('your_') || !config.TELEGRAM_BOT_TOKEN.trim()) {
    console.warn('[TELEGRAM] Bot token not provided or is placeholder; Telegram polling disabled.');
    return null;
  }

  try {
    bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN);

    // Provide bot.sendMessage alias if api.sendMessage is used
    if (!bot.sendMessage && bot.api && bot.api.sendMessage) {
      bot.sendMessage = (chatId, text, options) => bot.api.sendMessage(chatId, text, options);
    }

    // Catch bot errors to prevent unhandled exceptions crashing the server
    if (typeof bot.catch === 'function') {
      bot.catch((err) => {
        console.warn('[TELEGRAM] Bot error:', (err && err.message) || err);
      });
    }

    // Handle incoming /start commands with invite payload
    bot.command('start', async (ctx) => {
      const chatId = ctx.message ? ctx.message.chat.id : (ctx.chat ? ctx.chat.id : null);
      if (!chatId) return;

      const payload = (ctx.match || '').trim();
      const from = ctx.message ? ctx.message.from : ctx.from;
      const firstName = (from && from.first_name) ? from.first_name.trim() : '';
      const lastName = (from && from.last_name) ? from.last_name.trim() : '';
      const contactName = [firstName, lastName].filter(Boolean).join(' ') || (from && from.username) || 'Telegram Contact';

      try {
        if (payload.startsWith('self_')) {
          // Payload is "self_<invite_code>": link owner's chat_id for reminders
          const inviteCode = payload.slice(5).trim();
          const userRes = await db.query(
            'SELECT id, name FROM users WHERE invite_code = $1',
            [inviteCode]
          );

          if (userRes.rows.length === 0) {
            const replyMsg = '⚠ Invalid or expired invite code. Could not link account.';
            if (ctx.reply) await ctx.reply(replyMsg);
            else await bot.api.sendMessage(chatId, replyMsg);
            return;
          }

          const user = userRes.rows[0];
          await db.query(
            'UPDATE users SET telegram_chat_id = $1 WHERE id = $2',
            [chatId, user.id]
          );

          const confirmMsg = `✓ Your Telegram account is now linked to ${user.name || 'your'}'s JARVIS for reminders.`;
          if (ctx.reply) await ctx.reply(confirmMsg);
          else await bot.api.sendMessage(chatId, confirmMsg);
        } else if (payload) {
          // Payload is "<invite_code>": register sender as a contact for that user
          const inviteCode = payload.trim();
          const userRes = await db.query(
            'SELECT id, name FROM users WHERE invite_code = $1',
            [inviteCode]
          );

          if (userRes.rows.length === 0) {
            const replyMsg = '⚠ Invalid or expired invite link. Could not connect to JARVIS.';
            if (ctx.reply) await ctx.reply(replyMsg);
            else await bot.api.sendMessage(chatId, replyMsg);
            return;
          }

          const user = userRes.rows[0];

          // Upsert contact for that user
          await db.query(
            `INSERT INTO contacts (user_id, name, chat_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, chat_id)
             DO UPDATE SET name = EXCLUDED.name`,
            [user.id, contactName, chatId]
          );

          const welcomeMsg = `You are now connected to ${user.name || "your commander"}'s JARVIS.`;
          if (ctx.reply) await ctx.reply(welcomeMsg);
          else await bot.api.sendMessage(chatId, welcomeMsg);
        } else {
          // No payload provided
          const greetingMsg = 'Welcome to J.A.R.V.I.S. To connect with a user, please click the invite link provided in their JARVIS Command Centre.';
          if (ctx.reply) await ctx.reply(greetingMsg);
          else await bot.api.sendMessage(chatId, greetingMsg);
        }
      } catch (err) {
        console.error('[TELEGRAM] Error handling /start command:', err.message);
        try {
          const errNotice = '⚠ J.A.R.V.I.S encountered an internal error processing your request.';
          if (ctx.reply) await ctx.reply(errNotice);
          else await bot.api.sendMessage(chatId, errNotice);
        } catch (_) {}
      }
    });

    // Start polling in background and catch any polling failures without crashing
    if (typeof bot.startPolling === 'function') {
      bot.startPolling().catch((pollErr) => {
        console.warn('[TELEGRAM] Polling stopped or errored:', (pollErr && pollErr.message) || pollErr);
      });
      console.log('[TELEGRAM] Telegram bot polling started successfully');
    }
  } catch (err) {
    console.warn('[TELEGRAM] Could not initialize Telegram bot:', err.message);
  }

  return bot;
}

/**
 * Resolve contact by name with case-insensitivity, aliases, and prefix matching.
 * @param {number} userId
 * @param {string} name
 * @returns {Promise<{contact?: object, candidates?: object[], notFound?: boolean, known?: string[]}>}
 */
async function resolveContact(userId, name) {
  const query = (name || '').trim().toLowerCase();

  const res = await db.query(
    'SELECT id, name, aliases, chat_id, created_at FROM contacts WHERE user_id = $1 ORDER BY name ASC',
    [userId]
  );
  const contacts = res.rows;
  const known = contacts.map((c) => c.name);

  if (!query) {
    return { notFound: true, known };
  }

  // 1. Exact case-insensitive match on contact name
  const nameMatches = contacts.filter(
    (c) => (c.name || '').trim().toLowerCase() === query
  );
  if (nameMatches.length === 1) {
    return { contact: nameMatches[0] };
  }
  if (nameMatches.length > 1) {
    return { candidates: nameMatches };
  }

  // 2. Exact case-insensitive match on aliases
  const aliasMatches = contacts.filter((c) =>
    Array.isArray(c.aliases) &&
    c.aliases.some((a) => (a || '').trim().toLowerCase() === query)
  );
  if (aliasMatches.length === 1) {
    return { contact: aliasMatches[0] };
  }
  if (aliasMatches.length > 1) {
    return { candidates: aliasMatches };
  }

  // 3. "Starts with" match on contact name or any alias
  const startsWithMatches = contacts.filter((c) => {
    const contactName = (c.name || '').trim().toLowerCase();
    if (contactName.startsWith(query)) return true;
    if (Array.isArray(c.aliases)) {
      return c.aliases.some((a) => (a || '').trim().toLowerCase().startsWith(query));
    }
    return false;
  });
  if (startsWithMatches.length === 1) {
    return { contact: startsWithMatches[0] };
  }
  if (startsWithMatches.length > 1) {
    return { candidates: startsWithMatches };
  }

  // 4. Not found
  return { notFound: true, known };
}

/**
 * Send a message to a contact via the Telegram bot and write a comms record.
 * @param {number} userId
 * @param {number} contactId
 * @param {string} text
 * @returns {Promise<object>} The comms record
 */
async function sendMessage(userId, contactId, text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    const err = new Error('Message text is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  const contactRes = await db.query(
    'SELECT id, name, chat_id FROM contacts WHERE id = $1 AND user_id = $2',
    [contactId, userId]
  );

  if (contactRes.rows.length === 0) {
    const err = new Error('Recipient contact not found');
    err.code = 'recipient_not_found';
    err.status = 404;
    throw err;
  }

  const contact = contactRes.rows[0];

  if (!bot) {
    const errorMsg = 'Telegram bot is not initialized';
    const insertRes = await db.query(
      `INSERT INTO comms (user_id, contact_id, recipient_name, body, status, error)
       VALUES ($1, $2, $3, $4, 'failed', $5)
       RETURNING id, user_id, contact_id, recipient_name, body, status, error, created_at`,
      [userId, contact.id, contact.name, text.trim(), errorMsg]
    );

    const unavailErr = new Error(errorMsg);
    unavailErr.code = 'integration_unavailable';
    unavailErr.status = 503;
    unavailErr.comms = insertRes.rows[0];
    throw unavailErr;
  }

  try {
    if (bot.sendMessage) {
      await bot.sendMessage(contact.chat_id, text.trim());
    } else {
      await bot.api.sendMessage(contact.chat_id, text.trim());
    }

    // Record successful transmission in comms table
    const insertRes = await db.query(
      `INSERT INTO comms (user_id, contact_id, recipient_name, body, status, error)
       VALUES ($1, $2, $3, $4, 'sent', NULL)
       RETURNING id, user_id, contact_id, recipient_name, body, status, error, created_at`,
      [userId, contact.id, contact.name, text.trim()]
    );

    return insertRes.rows[0];
  } catch (rawErr) {
    console.error(`[TELEGRAM] Failed to send message to ${contact.name}:`, rawErr.message);

    const statusCode = (rawErr.response && rawErr.response.statusCode) ||
                       (rawErr.response && rawErr.response.body && rawErr.response.body.error_code) ||
                       rawErr.error_code;
    const desc = (rawErr.response && rawErr.response.body && rawErr.response.body.description) ||
                 rawErr.description ||
                 rawErr.message ||
                 '';

    let errCode = 'integration_unavailable';
    let errStatus = 503;
    let errMsg = 'Telegram service temporarily unavailable.';

    if (statusCode === 403 || desc.toLowerCase().includes('blocked') || desc.toLowerCase().includes('deactivated')) {
      errCode = 'recipient_unreachable';
      errStatus = 400;
      errMsg = `Recipient ${contact.name} has blocked the Telegram bot or deactivated their account.`;
    } else if (statusCode === 400 || desc.toLowerCase().includes('chat not found')) {
      errCode = 'recipient_unreachable';
      errStatus = 400;
      errMsg = `Telegram chat for ${contact.name} not found.`;
    }

    // Write failed comms record
    const insertRes = await db.query(
      `INSERT INTO comms (user_id, contact_id, recipient_name, body, status, error)
       VALUES ($1, $2, $3, $4, 'failed', $5)
       RETURNING id, user_id, contact_id, recipient_name, body, status, error, created_at`,
      [userId, contact.id, contact.name, text.trim(), desc || errMsg]
    );

    const mappedErr = new Error(errMsg);
    mappedErr.code = errCode;
    mappedErr.status = errStatus;
    mappedErr.comms = insertRes.rows[0];
    throw mappedErr;
  }
}

/**
 * Send a plaintext message to a specific Telegram chat ID (used for notifications & reminders).
 * @param {number|string} chatId
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function sendTextMessage(chatId, text) {
  if (!bot || !chatId) {
    return false;
  }

  try {
    if (bot.sendMessage) {
      await bot.sendMessage(chatId, text);
    } else {
      await bot.api.sendMessage(chatId, text);
    }
    return true;
  } catch (err) {
    console.error(`[TELEGRAM] Failed to send message to ${chatId}:`, err.message);
    return false;
  }
}

module.exports = {
  init,
  get bot() {
    return bot;
  },
  resolveContact,
  sendMessage,
  sendTextMessage
};
