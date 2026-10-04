/**
 * command.js - Route for JARVIS AI command processing via Server-Sent Events
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const geminiService = require('../services/gemini');

/**
 * POST /api/command
 * Processes natural language commands via multi-step agent loop, streaming events via SSE.
 */
router.post('/api/command', requireAuth, async (req, res, next) => {
  const { text, command, history, timezone, nowISO } = req.body;
  const inputText = (text || command || '').trim();

  // Validate command text length (1 - 1000 characters)
  if (!inputText || inputText.length > 1000) {
    return res.status(400).json({
      error: 'Command text must be between 1 and 1000 characters.',
      code: 'validation'
    });
  }

  // Set headers for Server-Sent Events stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const abortController = new AbortController();

  // Abort reasoning loop if client closes the HTTP connection
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const emit = (event) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  try {
    await geminiService.runAgent({
      userId: req.session.userId,
      text: inputText,
      history: Array.isArray(history) ? history : [],
      timezone: timezone || 'UTC',
      nowISO: nowISO || new Date().toISOString(),
      emit,
      signal: abortController.signal
    });
  } catch (err) {
    console.error('[COMMAND] Error running agent loop:', err.message);
    emit({
      type: 'error',
      code: 'ai_unavailable',
      message: 'JARVIS reasoning core encountered an error. Try again shortly.'
    });
  } finally {
    emit({ type: 'done' });
    res.end();
  }
});

module.exports = router;
