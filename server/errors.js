/**
 * errors.js - Centralized system error codes and error factory for J.A.R.V.I.S server
 */

const ERROR_CODES = {
  AUTH_EXPIRED: 'auth_expired',
  PERMISSION_DENIED: 'permission_denied',
  VALIDATION: 'validation',
  CLARIFICATION_NEEDED: 'clarification_needed',
  RECIPIENT_UNREACHABLE: 'recipient_unreachable',
  INTEGRATION_UNAVAILABLE: 'integration_unavailable',
  AI_UNAVAILABLE: 'ai_unavailable',
  NOT_FOUND: 'not_found'
};

const ERROR_METADATA = {
  [ERROR_CODES.AUTH_EXPIRED]: {
    status: 401,
    defaultMessage: 'Google authorization expired or not present. Please reconnect.'
  },
  [ERROR_CODES.PERMISSION_DENIED]: {
    status: 403,
    defaultMessage: 'Access to the requested resource was denied.'
  },
  [ERROR_CODES.VALIDATION]: {
    status: 400,
    defaultMessage: 'Invalid or missing parameters.'
  },
  [ERROR_CODES.CLARIFICATION_NEEDED]: {
    status: 400,
    defaultMessage: 'Additional details are needed to complete your request.'
  },
  [ERROR_CODES.RECIPIENT_UNREACHABLE]: {
    status: 400,
    defaultMessage: 'Recipient is unreachable on Telegram. They must start a chat with the bot.'
  },
  [ERROR_CODES.INTEGRATION_UNAVAILABLE]: {
    status: 503,
    defaultMessage: 'The external service is temporarily unavailable.'
  },
  [ERROR_CODES.AI_UNAVAILABLE]: {
    status: 503,
    defaultMessage: 'JARVIS reasoning core is temporarily unavailable.'
  },
  [ERROR_CODES.NOT_FOUND]: {
    status: 404,
    defaultMessage: 'The requested resource was not found.'
  }
};

/**
 * Create a standardized Error with system error code and HTTP status code.
 * @param {string} code
 * @param {string} [message]
 * @param {number} [status]
 * @returns {Error}
 */
function createError(code, message, status) {
  const meta = ERROR_METADATA[code] || { status: 500, defaultMessage: 'An internal error occurred.' };
  const err = new Error(message || meta.defaultMessage);
  err.code = code;
  err.status = status || meta.status;
  return err;
}

module.exports = {
  ERROR_CODES,
  ERROR_METADATA,
  createError
};
