/**
 * tools.js - Gemini function declarations and executors for J.A.R.V.I.S tools
 */

const db = require('../db');
const calendarService = require('./calendar');
const remindersService = require('./reminders');
const driveService = require('./drive');
const telegramService = require('./telegram');

/**
 * Gemini Function Declarations for assistant tool calling
 */
const functionDeclarations = [
  {
    name: 'create_calendar_event',
    description: 'Create a new event in Google Calendar. Datetimes must be in ISO 8601 format with timezone offset.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Title or subject of the calendar event'
        },
        start_iso: {
          type: 'STRING',
          description: 'Event start datetime in ISO 8601 format with timezone offset'
        },
        end_iso: {
          type: 'STRING',
          description: 'Event end datetime in ISO 8601 format with timezone offset (defaults to start + 60 minutes)'
        },
        description: {
          type: 'STRING',
          description: 'Optional description or notes for the event'
        }
      },
      required: ['title', 'start_iso']
    }
  },
  {
    name: 'list_calendar_events',
    description: 'List upcoming events from Google Calendar within a datetime range.',
    parameters: {
      type: 'OBJECT',
      properties: {
        from_iso: {
          type: 'STRING',
          description: 'Start of the query window in ISO 8601 format with offset (defaults to now)'
        },
        to_iso: {
          type: 'STRING',
          description: 'End of the query window in ISO 8601 format with offset (defaults to 14 days ahead)'
        }
      }
    }
  },
  {
    name: 'create_reminder',
    description: 'Create an in-app reminder to be stored in the database and alerted via browser and Telegram.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description: 'The reminder message or task description'
        },
        due_iso: {
          type: 'STRING',
          description: 'When the reminder is due in ISO 8601 format with offset (must be in the future)'
        }
      },
      required: ['text', 'due_iso']
    }
  },
  {
    name: 'list_reminders',
    description: 'List reminders stored in the database by scope.',
    parameters: {
      type: 'OBJECT',
      properties: {
        scope: {
          type: 'STRING',
          enum: ['today', 'upcoming', 'all'],
          description: 'Filter scope: "today", "upcoming", or "all"'
        }
      }
    }
  },
  {
    name: 'search_drive',
    description: 'Search files and folders in Google Drive by filename or content keywords.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search keywords or phrases'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'request_file_upload',
    description: "Request the user to upload a file from their local device to Google Drive. Opens the frontend file picker dialog.",
    parameters: {
      type: 'OBJECT',
      properties: {
        folder_name: {
          type: 'STRING',
          description: 'Optional destination folder name in Google Drive'
        }
      }
    }
  },
  {
    name: 'send_telegram_message',
    description: "Stage a Telegram message for user confirmation. Does NOT send immediately; requires explicit user approval before delivery.",
    parameters: {
      type: 'OBJECT',
      properties: {
        recipient: {
          type: 'STRING',
          description: 'Name or alias of the contact to message'
        },
        message: {
          type: 'STRING',
          description: 'Content of the message to send'
        }
      },
      required: ['recipient', 'message']
    }
  }
];

/**
 * Generate human-readable summary for a tool execution step.
 * @param {string} name
 * @param {object} args
 * @returns {string}
 */
function getToolSummary(name, args = {}) {
  switch (name) {
    case 'create_calendar_event':
      return `Schedule "${args.title || 'Event'}"`;
    case 'list_calendar_events':
      return 'Check calendar schedule';
    case 'create_reminder':
      return `Set reminder "${args.text || 'Reminder'}"`;
    case 'list_reminders':
      return `Check ${args.scope || 'upcoming'} reminders`;
    case 'search_drive':
      return `Search Drive for "${args.query || ''}"`;
    case 'request_file_upload':
      return `Request file upload${args.folder_name ? ' to ' + args.folder_name : ''}`;
    case 'send_telegram_message':
      return `Prepare Telegram message to ${args.recipient || 'recipient'}`;
    default:
      return `Execute ${name}`;
  }
}

/**
 * Log tool execution to action_log table.
 * @param {number} userId
 * @param {string} tool
 * @param {string} summary
 * @param {'success' | 'failed' | 'cancelled' | 'pending'} status
 * @param {string} [error=null]
 */
async function logAction(userId, tool, summary, status, error = null) {
  try {
    await db.query(
      `INSERT INTO action_log (user_id, tool, summary, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tool, summary, status, error]
    );
  } catch (err) {
    console.warn('[TOOLS] Failed to write action_log:', err.message);
  }
}

/**
 * Execute a specific tool on behalf of the user.
 * @param {number} userId
 * @param {string} name
 * @param {object} args
 * @returns {Promise<object>} Small JSON-serializable result
 */
async function executeTool(userId, name, args = {}) {
  switch (name) {
    case 'create_calendar_event': {
      const event = await calendarService.createEvent(userId, {
        title: args.title,
        startISO: args.start_iso,
        endISO: args.end_iso,
        description: args.description
      });
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.description,
        htmlLink: event.htmlLink
      };
    }

    case 'list_calendar_events': {
      const events = await calendarService.listEvents(userId, {
        fromISO: args.from_iso,
        toISO: args.to_iso
      });
      return { events };
    }

    case 'create_reminder': {
      const reminder = await remindersService.createReminder(userId, args.text, args.due_iso);
      return {
        id: reminder.id,
        text: reminder.text,
        due_at: reminder.due_at,
        status: reminder.status
      };
    }

    case 'list_reminders': {
      const reminders = await remindersService.listReminders(userId, args.scope || 'upcoming');
      return { reminders };
    }

    case 'search_drive': {
      const files = await driveService.searchFiles(userId, { query: args.query });
      return {
        count: files.length,
        files: files.slice(0, 10).map((f) => ({
          name: f.name,
          folder: f.folderName,
          modified: f.modifiedTime,
          link: f.webViewLink
        }))
      };
    }

    case 'request_file_upload': {
      const targetFolder = args.folder_name ? args.folder_name.trim() : 'My Drive';
      return {
        ui_action: 'open_upload',
        folderName: targetFolder
      };
    }

    case 'send_telegram_message': {
      const recipientName = (args.recipient || '').trim();
      const messageText = (args.message || '').trim();

      if (!recipientName) {
        const err = new Error('Recipient name is required to send a Telegram message.');
        err.code = 'clarification_needed';
        throw err;
      }

      if (!messageText) {
        const err = new Error('Message text is required to send a Telegram message.');
        err.code = 'clarification_needed';
        throw err;
      }

      // Resolve contact against user's contact list
      const resolved = await telegramService.resolveContact(userId, recipientName);

      if (resolved.notFound) {
        const knownList = resolved.known && resolved.known.length > 0
          ? resolved.known.join(', ')
          : 'no contacts connected yet';
        const err = new Error(
          `I could not find a contact named "${recipientName}". Known contacts: ${knownList}.`
        );
        err.code = 'clarification_needed';
        throw err;
      }

      if (resolved.candidates) {
        const candidateNames = resolved.candidates.map((c) => c.name).join(', ');
        const err = new Error(
          `Multiple contacts match "${recipientName}": ${candidateNames}. Which one should receive the message, sir?`
        );
        err.code = 'clarification_needed';
        throw err;
      }

      const contact = resolved.contact;
      const previewMsg = messageText.length > 60 ? `${messageText.slice(0, 57)}...` : messageText;
      const humanSummary = `Send to ${contact.name}: "${previewMsg}"`;

      // Insert pending action row requiring user confirmation
      const insertRes = await db.query(
        `INSERT INTO pending_actions (user_id, tool, args, summary, status)
         VALUES ($1, 'send_telegram_message', $2, $3, 'pending')
         RETURNING id`,
        [
          userId,
          JSON.stringify({
            recipient: contact.name,
            contactId: contact.id,
            message: messageText
          }),
          humanSummary
        ]
      );

      const actionId = insertRes.rows[0].id;

      // Log action as pending
      await logAction(userId, 'send_telegram_message', humanSummary, 'pending');

      return {
        status: 'awaiting_user_confirmation',
        actionId,
        recipient: contact.name,
        message: messageText
      };
    }

    default: {
      const err = new Error(`Unknown tool: ${name}`);
      err.code = 'tool_not_found';
      err.status = 400;
      throw err;
    }
  }
}

module.exports = {
  functionDeclarations,
  getToolSummary,
  logAction,
  executeTool
};
