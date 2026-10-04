/**
 * config.js - Central configuration and environment variable validator
 */

require('dotenv').config();

const REQUIRED_ENV_VARS = [
  'PORT',
  'BASE_URL',
  'DATABASE_URL',
  'SESSION_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'GEMINI_API_KEY',
  'GEMINI_MODEL'
];

// Validate presence of all required environment variables at boot
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key] || process.env[key].trim() === '');

if (missingVars.length > 0) {
  console.error(`[FATAL] Missing required environment variable(s): ${missingVars.join(', ')}`);
  console.error('Please configure them in your .env file before starting the server.');
  process.exit(1);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  BASE_URL: process.env.BASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL
};
