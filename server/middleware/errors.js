/**
 * errors.js - Centralized Express error handler
 */

const config = require('../config');

/**
 * Global API error handling middleware.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || (status === 500 ? 'internal_error' : 'request_error');
  const message = err.message || 'An unexpected server error occurred';

  // Log internal errors on server console
  if (status >= 500) {
    console.error(`[ERROR 500] ${req.method} ${req.originalUrl}:`, err);
  }

  const payload = {
    error: err.name || 'Error',
    code,
    message
  };

  // Stack traces are strictly hidden in production environments
  if (config.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
}

/**
 * 404 handler for undefined API routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    code: 'not_found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
