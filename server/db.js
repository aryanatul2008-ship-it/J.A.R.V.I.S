/**
 * db.js - PostgreSQL database pool connection and initialization
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Execute a parameterized SQL query with unified error handling.
 * @param {string} text
 * @param {Array} [params]
 */
async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    // Provide explicit query context for debugging database errors
    console.error(`[DB ERROR] Failed executing query: ${text}`);
    throw err;
  }
}

/**
 * Run schema.sql migrations on server startup with retries for serverless Postgres pools.
 */
async function init() {
  let retries = 4;
  while (retries > 0) {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('[DB] Database schema initialized successfully');
      return;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error('[DB FATAL] Could not initialize database schema:', err.message);
        throw err;
      }
      console.warn(`[DB] Connection retry (${4 - retries}/4) due to: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

module.exports = {
  pool,
  query,
  init
};
