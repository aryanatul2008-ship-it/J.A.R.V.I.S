/**
 * telegram.js - Telegram Bot API integration service
 */

const TelegramPkg = require('node-telegram-bot-api');
const config = require('../config');

const TelegramBot = TelegramPkg.Bot || TelegramPkg;

let bot = null;

if (config.TELEGRAM_BOT_TOKEN && !config.TELEGRAM_BOT_TOKEN.includes('your_')) {
  try {
    bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN);
  } catch (err) {
    console.warn('[TELEGRAM] Could not initialize Telegram bot:', err.message);
  }
}

/**
 * Send a plaintext message to a specific Telegram chat ID.
 * @param {number|string} chatId
 * @param {string} text
 */
async function sendTextMessage(chatId, text) {
  if (!bot || !chatId) {
    return false;
  }

  try {
    await bot.sendMessage(chatId, text);
    return true;
  } catch (err) {
    console.error(`[TELEGRAM] Failed to send message to ${chatId}:`, err.message);
    return false;
  }
}

module.exports = {
  bot,
  sendTextMessage
};
