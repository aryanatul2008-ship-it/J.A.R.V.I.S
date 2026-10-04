/**
 * events.js - Server-Sent Events (SSE) real-time event streaming
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Active SSE client response connections: Map<userId, Set<Response>>
const userClients = new Map();

/**
 * GET /api/events
 * Establishes a persistent Server-Sent Events stream for the authenticated user.
 */
router.get('/api/events', requireAuth, (req, res) => {
  const userId = req.session.userId;

  // Configure SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Initial handshake acknowledgment
  res.write(': connected\n\n');

  // Track active connection
  if (!userClients.has(userId)) {
    userClients.set(userId, new Set());
  }
  userClients.get(userId).add(res);

  // Send heartbeat comment every 25 seconds to keep connection alive
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(heartbeatTimer);
    }
  }, 25000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatTimer);
    const set = userClients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        userClients.delete(userId);
      }
    }
  });
});

/**
 * Push an event payload to all active browser connections for a user.
 * @param {number} userId
 * @param {object} event
 * @param {string} [event.type='message']
 * @param {any} event.data
 */
function pushToUser(userId, event) {
  const set = userClients.get(Number(userId));
  if (!set || set.size === 0) {
    return false;
  }

  const type = event.type || 'message';
  const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data !== undefined ? event.data : event);
  const payload = `event: ${type}\ndata: ${data}\n\n`;

  set.forEach((clientRes) => {
    try {
      clientRes.write(payload);
    } catch (err) {
      console.warn(`[SSE] Error pushing event to user ${userId}:`, err.message);
    }
  });

  return true;
}

module.exports = {
  router,
  pushToUser
};
