/**
 * scheduler.js - Periodic reminder dispatcher using node-cron
 */

const cron = require('node-cron');
const db = require('../db');
const { pushToUser } = require('../routes/events');
const telegramService = require('./telegram');

let cronTask = null;

/**
 * Poll for active reminders that are due and trigger notifications.
 */
async function checkDueReminders() {
  try {
    // Atomically claim and mark due reminders as fired to prevent double processing
    const query = `
      WITH due AS (
        UPDATE reminders
        SET status = 'fired'
        WHERE status = 'active' AND due_at <= NOW()
        RETURNING id, user_id, text, due_at, status
      )
      SELECT due.id, due.user_id, due.text, due.due_at, due.status, users.telegram_chat_id
      FROM due
      LEFT JOIN users ON due.user_id = users.id;
    `;

    const res = await db.query(query);

    if (res.rows.length > 0) {
      console.log(`[SCHEDULER] Dispatched ${res.rows.length} due reminder(s)`);

      for (const item of res.rows) {
        // 1. Broadcast SSE event to user's open browser tabs
        pushToUser(item.user_id, {
          type: 'reminder',
          data: {
            id: item.id,
            text: item.text,
            due_at: item.due_at,
            status: item.status
          }
        });

        // 2. Dispatch Telegram notification if user has linked chat
        if (item.telegram_chat_id) {
          telegramService.sendTextMessage(
            item.telegram_chat_id,
            `Reminder: ${item.text}`
          ).catch((err) => {
            console.error(`[SCHEDULER] Telegram notification failed for user ${item.user_id}:`, err.message);
          });
        }
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error processing due reminders:', err.message);
  }
}

/**
 * Initialize background scheduler to run every 30 seconds.
 */
function init() {
  if (cronTask) return cronTask;

  // Run every 30 seconds
  cronTask = cron.schedule('*/30 * * * * *', checkDueReminders);
  console.log('[SCHEDULER] Reminder scheduler active (interval: 30s)');
  return cronTask;
}

module.exports = {
  init,
  checkDueReminders
};
