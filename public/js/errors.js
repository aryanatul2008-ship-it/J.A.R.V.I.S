/**
 * errors.js - Centralized frontend error codes, JARVIS-style messages and suggested actions
 */

const ERROR_MAP = {
  auth_expired: {
    title: 'AUTHORIZATION EXPIRED',
    message: 'Google authorization has expired, sir. Calendar and Drive operations are paused.',
    action: 'Reconnect Google',
    actionType: 'reconnect_google'
  },
  permission_denied: {
    title: 'PERMISSION DENIED',
    message: 'Access to this resource was denied by Google Workspace or security rules, sir.',
    action: 'Check account permissions',
    actionType: 'check_permissions'
  },
  validation: {
    title: 'PARAMETER ERROR',
    message: 'One or more required parameters are missing or improperly formatted, sir.',
    action: 'Verify details and retry',
    actionType: 'retry'
  },
  clarification_needed: {
    title: 'CLARIFICATION NEEDED',
    message: 'A critical detail is missing from your command (time, recipient, or content).',
    action: 'Provide missing detail',
    actionType: 'clarify'
  },
  recipient_unreachable: {
    title: 'RECIPIENT UNREACHABLE',
    message: 'Unable to message this contact via Telegram. They have not started a chat with me yet.',
    action: 'Share your invite link',
    actionType: 'copy_invite'
  },
  integration_unavailable: {
    title: 'SERVICE UNAVAILABLE',
    message: 'The requested external service is experiencing network disruptions or an outage.',
    action: 'Wait a moment and retry',
    actionType: 'retry'
  },
  ai_unavailable: {
    title: 'NEURAL CORE BUSY',
    message: 'My reasoning core is under heavy demand. Fallback inference did not respond.',
    action: 'Retry command in a few seconds',
    actionType: 'retry'
  },
  not_found: {
    title: 'NOT FOUND',
    message: 'The requested file, folder, contact, or item could not be located in our records.',
    action: 'Check search terms',
    actionType: 'search'
  }
};

/**
 * Format an error code into a user-friendly JARVIS message and actionable suggestion.
 * @param {string} code
 * @param {string} [rawMessage]
 * @returns {{ title: string, message: string, action: string, actionType: string }}
 */
function getFriendlyError(code, rawMessage = '') {
  const normalizedCode = (code || '').toLowerCase().trim();
  const entry = ERROR_MAP[normalizedCode] || {
    title: 'EXECUTION ERROR',
    message: rawMessage || 'An unexpected operational anomaly occurred, sir.',
    action: 'Try again',
    actionType: 'retry'
  };

  return {
    title: entry.title,
    message: rawMessage ? `${rawMessage} (${entry.message})` : entry.message,
    action: entry.action,
    actionType: entry.actionType
  };
}

window.ERROR_MAP = ERROR_MAP;
window.getFriendlyError = getFriendlyError;
