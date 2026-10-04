/**
 * chat.js - Console log, streaming command execution, step indicators, and action confirmations
 */

let totalActions = 0;
const chatHistory = [];

/**
 * Escape HTML characters safely.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s || '').replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/**
 * Format markdown styles (bold, italics, code, quotes, newlines) safely.
 * @param {string} raw
 * @returns {string}
 */
function formatMessage(raw) {
  if (!raw) return '';
  let s = esc(raw);

  // Bold: **text**
  s = s.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  // Italic: *text* or _text_
  s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');

  // Inline code: `text`
  s = s.replace(/`([^`]+)`/g, '<code style="background:rgba(31,214,240,0.12);padding:1px 5px;font-family:monospace;color:var(--ok);font-size:12px;">$1</code>');

  // Blockquotes: lines starting with &gt;
  s = s.replace(/(^|<br>)(&gt;\s*.*?)(?=(<br>|$))/g, function(match, prefix, quote) {
    const quoteText = quote.replace(/^&gt;\s*/, '');
    return `${prefix}<blockquote>${quoteText}</blockquote>`;
  });

  // Newlines
  s = s.replace(/\n/g, '<br>');

  return s;
}

/**
 * Update the JARVIS status indicator.
 * @param {'online' | 'processing' | 'offline'} state
 */
function setStatus(state) {
  const st = document.querySelector('#st');
  const stt = document.querySelector('#stt');
  if (!st || !stt) return;

  st.classList.remove('busy', 'offline');

  if (state === 'processing') {
    st.classList.add('busy');
    stt.textContent = 'JARVIS PROCESSING';
  } else if (state === 'offline') {
    st.classList.add('offline');
    stt.textContent = 'JARVIS OFFLINE';
  } else {
    // Default: 'online'
    stt.textContent = 'JARVIS ONLINE';
  }
}

/**
 * Append a formatted message to the console log.
 * @param {'u' | 'j' | 'e'} type - 'u' for user, 'j' for jarvis, 'e' for error
 * @param {string} html - HTML message content
 * @returns {HTMLElement|null}
 */
function addMessage(type, html) {
  const log = document.querySelector('#log');
  if (!log) return null;

  const d = document.createElement('div');
  d.className = 'm ' + type;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

/**
 * Display a temporary floating toast message.
 * @param {string} text
 */
function showToast(text) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('on');
  setTimeout(() => {
    t.classList.remove('on');
  }, 1800);
}

/**
 * Update the action counter badge in the console header.
 * @param {number} count
 */
function updateActionCount(count) {
  const cnt = document.querySelector('#cnt');
  if (cnt) {
    cnt.textContent = `${count} ACTION${count === 1 ? '' : 'S'}`;
  }
}

/**
 * Derive human-readable completion summary for a completed step.
 * @param {string} summary
 * @param {object} [result]
 * @param {string} [tool]
 * @returns {string}
 */
function getDoneSummary(summary, result, tool) {
  if (tool === 'create_calendar_event') {
    const title = (result && result.title) || '';
    return title ? `Created calendar event: ${title}` : (summary || 'Calendar event created');
  }
  if (tool === 'list_calendar_events') {
    const count = (result && result.events && result.events.length) || 0;
    return `Retrieved ${count} calendar event${count === 1 ? '' : 's'}`;
  }
  if (tool === 'create_reminder') {
    const text = (result && result.text) || '';
    return text ? `Created reminder: ${text}` : (summary || 'Reminder created');
  }
  if (tool === 'list_reminders') {
    const count = (result && result.reminders && result.reminders.length) || 0;
    return `Retrieved ${count} reminder${count === 1 ? '' : 's'}`;
  }
  if (tool === 'search_drive') {
    const count = (result && (result.count ?? (result.files && result.files.length))) || 0;
    return `Found ${count} matching file${count === 1 ? '' : 's'} in Drive`;
  }
  if (tool === 'request_file_upload') {
    return `Drive upload dialog opened for ${result?.folderName || 'Drive'}`;
  }
  if (tool === 'send_telegram_message') {
    return `Staged message for ${result?.recipient || 'contact'} (awaiting confirmation)`;
  }

  // Fallback verb replacement
  return (summary || 'Action completed')
    .replace(/^Creating /i, 'Created ')
    .replace(/^Searching /i, 'Searched ')
    .replace(/^Listing /i, 'Listed ')
    .replace(/^Staging /i, 'Staged ');
}

/**
 * Render in-chat step line in "running" state with spinner.
 * @param {string} id
 * @param {string} summary
 */
function renderStepRunning(id, summary) {
  const log = document.querySelector('#log');
  if (!log) return;

  let stepEl = document.querySelector(`#step-${id}`);
  if (!stepEl) {
    stepEl = document.createElement('div');
    stepEl.id = `step-${id}`;
    stepEl.className = 'step-line running';
    log.appendChild(stepEl);
  } else {
    stepEl.className = 'step-line running';
  }

  stepEl.innerHTML = `
    <span class="step-spinner"></span>
    <span class="step-summary">▶ ${esc(summary || 'Processing')}…</span>
  `;
  log.scrollTop = log.scrollHeight;
}

/**
 * Render in-chat step line in "done" state with check mark.
 * @param {string} id
 * @param {string} summary
 * @param {object} [result]
 * @param {string} [tool]
 */
function renderStepDone(id, summary, result, tool) {
  const log = document.querySelector('#log');
  if (!log) return;

  let stepEl = document.querySelector(`#step-${id}`);
  if (!stepEl) {
    stepEl = document.createElement('div');
    stepEl.id = `step-${id}`;
    log.appendChild(stepEl);
  }

  stepEl.className = 'step-line done';
  const doneSummary = getDoneSummary(summary, result, tool);
  stepEl.innerHTML = `
    <span class="step-icon check">✓</span>
    <span class="step-summary">${esc(doneSummary)}</span>
  `;

  totalActions++;
  updateActionCount(totalActions);
  log.scrollTop = log.scrollHeight;
}

/**
 * Render in-chat step line in "error" state.
 * @param {string} id
 * @param {string} summary
 * @param {string} [code]
 * @param {string} [message]
 */
function renderStepError(id, summary, code, message) {
  const log = document.querySelector('#log');
  if (!log) return;

  let stepEl = document.querySelector(`#step-${id}`);
  if (!stepEl) {
    stepEl = document.createElement('div');
    stepEl.id = `step-${id}`;
    log.appendChild(stepEl);
  }

  stepEl.className = 'step-line error';

  const friendly = window.getFriendlyError ? window.getFriendlyError(code, message || summary) : {
    title: 'ERROR',
    message: message || summary || 'Operation failed',
    action: 'Try again',
    actionType: 'retry'
  };

  let actionHtml = '';
  if (code === 'auth_expired' || friendly.actionType === 'reconnect_google') {
    actionHtml = '<a href="/auth/google" class="b auth-btn inline-auth-btn">Reconnect Google</a>';
  } else if (friendly.action) {
    actionHtml = `<span style="color: var(--warn); font-size: 11px; margin-left: 6px;">[${esc(friendly.action)}]</span>`;
  }

  stepEl.innerHTML = `
    <span class="step-icon">✕</span>
    <span class="step-summary"><b>${esc(friendly.title)}:</b> ${esc(friendly.message)}</span>
    ${actionHtml}
  `;

  if (code === 'auth_expired') {
    window.dispatchEvent(new CustomEvent('auth-expired', { detail: { code: 'auth_expired' } }));
    setStatus('offline');
  }

  log.scrollTop = log.scrollHeight;
}

/**
 * Render pending action confirmation card for Telegram staging.
 * @param {number|string} actionId
 * @param {string} recipient
 * @param {string} message
 */
function renderConfirmationCard(actionId, recipient, message) {
  const log = document.querySelector('#log');
  if (!log) return;

  const cardHtml = `
    <div class="pending-action-card" id="action-card-${actionId}">
      <div class="action-card-header">// ACTION CONFIRMATION REQUIRED</div>
      <div class="action-card-body">
        Telegram message to <b>${esc(recipient)}</b>:
        <blockquote class="action-card-quote">“${esc(message)}”</blockquote>
      </div>
      <div class="action-card-actions" id="action-btns-${actionId}">
        <button class="b" data-confirm-action="${actionId}">Send</button>
        <button class="b alt" data-cancel-action="${actionId}">Cancel</button>
      </div>
    </div>
  `;

  addMessage('j', cardHtml);
}

/**
 * Handle individual agent event streamed from POST /api/command.
 * @param {object} event
 * @param {string} userCommandText
 */
function handleEvent(event, userCommandText) {
  if (event.type === 'step') {
    if (event.status === 'running') {
      renderStepRunning(event.id, event.summary);
    } else if (event.status === 'done') {
      renderStepDone(event.id, event.summary, event.result, event.tool);

      // Handle UI actions
      if (event.result && event.result.ui_action === 'open_upload') {
        if (window.preview) window.preview.switchTab('drive');
        if (window.upload && window.upload.openUploadDialog) {
          window.upload.openUploadDialog(event.result.folderName);
        }
      }

      // Handle Staged Pending Action (Telegram Confirmation)
      if (event.result && event.result.status === 'awaiting_user_confirmation') {
        renderConfirmationCard(event.result.actionId, event.result.recipient, event.result.message);
      }

      // Refresh matching preview tab immediately and switch to that tab! Flash the new item.
      if (event.tool === 'create_calendar_event' || event.tool === 'list_calendar_events') {
        if (window.preview) {
          window.preview.refreshCalendar(event.result && event.result.id);
          window.preview.switchTab('cal');
        }
      } else if (event.tool === 'create_reminder' || event.tool === 'list_reminders') {
        if (window.preview) {
          window.preview.refreshReminders(event.result && event.result.id);
          window.preview.switchTab('rem');
        }
      } else if (event.tool === 'search_drive') {
        if (window.preview) {
          window.preview.showDriveSearchResults(event.result?.query, event.result?.files);
          window.preview.switchTab('drive');
        }
      } else if (event.tool === 'send_telegram_message') {
        if (window.preview) {
          window.preview.refreshComms(event.result && (event.result.id || event.result.actionId));
          window.preview.switchTab('comms');
        }
      }
    } else if (event.status === 'error') {
      renderStepError(event.id, event.summary, event.code, event.message);
    }
  } else if (event.type === 'message') {
    chatHistory.push({ role: 'model', text: event.text });
    addMessage('j', formatMessage(event.text));
  } else if (event.type === 'error') {
    const friendly = window.getFriendlyError ? window.getFriendlyError(event.code, event.message) : {
      title: 'ERROR',
      message: event.message || 'An error occurred',
      action: 'Try again'
    };
    const actionHtml = (event.code === 'auth_expired' || friendly.actionType === 'reconnect_google')
      ? '<a href="/auth/google" class="b auth-btn inline-auth-btn" style="margin-left: 8px;">Reconnect Google</a>'
      : (friendly.action ? ` &bull; <i>Suggestion: ${esc(friendly.action)}</i>` : '');

    addMessage('e', `⚠ <b>${esc(friendly.title)}:</b> ${esc(friendly.message)}${actionHtml}`);
  }
}

/**
 * Send command to POST /api/command and stream Server-Sent Events response.
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>}
 */
async function streamCommand(text, signal) {
  addMessage('u', esc(text));
  chatHistory.push({ role: 'user', text });

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const nowISO = new Date().toISOString();

  let response;
  try {
    response = await fetch('/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        text,
        history: chatHistory.slice(-10),
        timezone: browserTimezone,
        nowISO
      }),
      signal
    });
  } catch (err) {
    if (signal && signal.aborted) {
      return false;
    }
    addMessage('e', `⚠ Connection to JARVIS lost`);
    showToast('Connection to JARVIS lost');
    return false;
  }

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('auth-expired', { detail: { url: '/api/command', status: 401 } }));
    setStatus('offline');
    return false;
  }

  if (!response.ok) {
    let errMessage = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      errMessage = errData.error || errData.message || errMessage;
    } catch (_) {}
    addMessage('e', `⚠ Command rejected: ${esc(errMessage)}`);
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop(); // Retain incomplete block in buffer

      for (const block of blocks) {
        const lines = block.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'done') {
              receivedDone = true;
            } else {
              handleEvent(event, text);
            }
          } catch (e) {
            console.warn('[SSE] Could not parse chunk:', jsonStr);
          }
        }
      }
    }
  } catch (readErr) {
    if (signal && signal.aborted) {
      return false;
    }
    console.warn('[SSE] Stream interrupted:', readErr.message);
  }

  // Fault tolerance: Stream closed without explicit 'done' event
  if (!receivedDone && (!signal || !signal.aborted)) {
    addMessage('e', '⚠ Connection to JARVIS lost');
    showToast('Connection to JARVIS lost');
    return false;
  }

  return true;
}

// Delegated click handler for Action Confirmation & Cancellation buttons
document.addEventListener('click', async (e) => {
  const confirmBtn = e.target.closest('button[data-confirm-action]');
  if (confirmBtn) {
    const actionId = confirmBtn.dataset.confirmAction;
    const btnsContainer = document.querySelector(`#action-btns-${actionId}`);
    if (confirmBtn.disabled) return;

    if (btnsContainer) {
      btnsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
      btnsContainer.innerHTML = '<span style="color: var(--gold); font-size: 11px;">Transmitting via Telegram…</span>';
    }

    try {
      await window.api.post(`/api/actions/${actionId}/confirm`);
      if (btnsContainer) {
        btnsContainer.innerHTML = '<span style="color: var(--ok); font-size: 11px; font-weight: 700;">✓ TRANSMISSION CONFIRMED &amp; SENT</span>';
      }
      showToast('Telegram message sent');
      if (window.preview) {
        window.preview.refreshComms();
        window.preview.switchTab('comms');
      }
    } catch (err) {
      if (btnsContainer) {
        btnsContainer.innerHTML = `<span style="color: var(--err); font-size: 11px;">⚠ Failed: ${esc(err.message)}</span>`;
      }
    }
    return;
  }

  const cancelBtn = e.target.closest('button[data-cancel-action]');
  if (cancelBtn) {
    const actionId = cancelBtn.dataset.cancelAction;
    const btnsContainer = document.querySelector(`#action-btns-${actionId}`);
    if (cancelBtn.disabled) return;

    if (btnsContainer) {
      btnsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
      btnsContainer.innerHTML = '<span style="color: var(--dim); font-size: 11px;">Cancelling…</span>';
    }

    try {
      await window.api.post(`/api/actions/${actionId}/cancel`);
      if (btnsContainer) {
        btnsContainer.innerHTML = '<span style="color: var(--dim); font-size: 11px;">✕ TRANSMISSION CANCELLED</span>';
      }
      showToast('Action cancelled');
      if (window.preview) {
        window.preview.refreshComms();
      }
    } catch (err) {
      if (btnsContainer) {
        btnsContainer.innerHTML = `<span style="color: var(--err); font-size: 11px;">⚠ Failed: ${esc(err.message)}</span>`;
      }
    }
    return;
  }
});

window.esc = esc;
window.setStatus = setStatus;
window.chat = {
  esc,
  setStatus,
  addMessage,
  showToast,
  updateActionCount,
  formatMessage,
  renderStepRunning,
  renderStepDone,
  renderStepError,
  renderConfirmationCard,
  handleEvent,
  streamCommand,
  chatHistory,
  getActionCount: () => totalActions
};
