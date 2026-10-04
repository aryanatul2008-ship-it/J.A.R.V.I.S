/**
 * app.js - Main frontend application coordinator for J.A.R.V.I.S
 */

const QUICK_CHIPS = [
  ['Schedule meeting', 'Schedule a meeting with Bruce Banner tomorrow at 4 PM'],
  ['Set reminder', 'Remind me to check the reactor at 8 PM'],
  ['Tomorrow’s schedule', 'What do I have scheduled for tomorrow?'],
  ['Find file', 'Find the reactor design report'],
  ['Upload document', 'Upload this document to my Drive'],
  ['Combo: 3 actions', 'JARVIS, schedule the Stark team meeting for tomorrow at 6 PM, remind me 30 minutes before it, and send Bruce a Telegram message about it']
];

let currentUser = null;
let eventSource = null;

/**
 * Handle incoming real-time reminder alerts from Server-Sent Events.
 * @param {object} reminder
 */
function handleReminderAlert(reminder) {
  // Prominent in-app alert in JARVIS console style
  const alertHtml = `
    <div style="border: 1px solid var(--warn); background: rgba(242, 193, 78, 0.15); padding: 10px 14px; margin: 4px 0;">
      <span style="color: var(--warn); font-weight: 700; letter-spacing: 0.12em;">⚡ REMINDER ALERT:</span>
      <span style="color: var(--bone); margin-left: 8px;">${window.esc(reminder.text)}</span>
    </div>
  `;
  window.chat.addMessage('j', alertHtml);
  window.chat.showToast(`Reminder: ${reminder.text}`);

  // Browser system notification if permission was granted
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      try {
        new Notification('J.A.R.V.I.S Reminder', {
          body: reminder.text
        });
      } catch (_) {}
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  // Refresh active reminders view
  if (window.refreshReminders) {
    window.refreshReminders();
  }
}

/**
 * Connect to persistent Server-Sent Events stream.
 */
function initEventSource() {
  if (eventSource) return;

  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('reminder', (e) => {
    try {
      const data = JSON.parse(e.data);
      handleReminderAlert(data);
    } catch (err) {
      console.warn('[SSE] Failed to parse reminder event:', err.message);
    }
  });

  eventSource.onerror = (err) => {
    console.warn('[SSE] EventSource stream interrupted, will retry:', err);
  };
}

/**
 * Disconnect active Server-Sent Events stream.
 */
function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/**
 * Switch page visibility between Logged Out and Logged In views.
 * @param {boolean} isLoggedIn
 * @param {object} [user]
 */
function setAuthState(isLoggedIn, user = null) {
  const authView = document.querySelector('#auth-view');
  const mainView = document.querySelector('#main-view');
  const userProfile = document.querySelector('#user-profile');
  const userNameEl = document.querySelector('#user-name');
  const authBanner = document.querySelector('#auth-expired-banner');

  currentUser = user;
  window.currentUser = user;

  if (isLoggedIn) {
    if (authView) authView.style.display = 'none';
    if (mainView) mainView.style.display = 'grid';
    if (userProfile) userProfile.style.display = 'flex';
    if (userNameEl && user) {
      userNameEl.textContent = user.name || user.email || 'Tony Stark';
    }
    if (window.preview && window.preview.setUserInfo) {
      window.preview.setUserInfo(user);
    }
    initEventSource();
  } else {
    if (authView) authView.style.display = 'flex';
    if (mainView) mainView.style.display = 'none';
    if (userProfile) userProfile.style.display = 'none';
    if (authBanner) authBanner.style.display = 'none';
    closeEventSource();
  }
}

/**
 * Check authentication status and fetch profile via /api/me.
 */
async function checkAuth() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'app' || params.get('mock') === '1') {
    setAuthState(true, { name: 'Commander (Preview Mode)' });
    if (window.refreshCalendar) window.refreshCalendar();
    if (window.refreshReminders) window.refreshReminders();
    return;
  }

  try {
    const user = await window.api.get('/api/me');
    setAuthState(true, user);

    if (window.refreshCalendar) {
      window.refreshCalendar();
    }
    if (window.refreshReminders) {
      window.refreshReminders();
    }
    if (window.refreshComms) {
      window.refreshComms();
    }

    // Sync browser timezone with user profile
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimezone && browserTimezone !== user.timezone) {
      window.api.post('/api/me/timezone', { timezone: browserTimezone }).catch((err) => {
        console.warn('[TIMEZONE] Could not sync browser timezone:', err.message);
      });
    }
  } catch (err) {
    // 401 or network error defaults to logged-out boot screen
    setAuthState(false);
  }
}

/**
 * Render integration status chips as "unknown".
 */
function renderIntegrations() {
  const integ = document.querySelector('#integ');
  if (!integ) return;

  integ.innerHTML = `
    <button class="chip unknown" data-k="cal"><i></i>CALENDAR · UNKNOWN</button>
    <button class="chip unknown" data-k="drive"><i></i>DRIVE · UNKNOWN</button>
    <button class="chip unknown" data-k="tg"><i></i>TELEGRAM · UNKNOWN</button>
    <span class="hint">Service link states (live status synced from server)</span>
  `;
}

/**
 * Render quick action buttons below the queue bar.
 */
function renderQuickChips() {
  const container = document.querySelector('#chips');
  if (!container) return;

  container.innerHTML = '';
  QUICK_CHIPS.forEach(([label, cmd]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => submitCommand(cmd);
    container.appendChild(btn);
  });
}

let totalActions = 0;
let commandHistory = [];

/**
 * Handle individual agent event streamed from POST /api/command.
 * @param {object} event
 * @param {string} userCommandText
 */
function handleAgentEvent(event, userCommandText) {
  if (event.type === 'step') {
    if (event.status === 'running') {
      window.chat.addMessage('j', `<span style="color: var(--dim); font-size: 11px;">⚡ [AGENT] ${window.esc(event.summary)}…</span>`);
    } else if (event.status === 'done') {
      totalActions++;
      window.chat.updateActionCount(totalActions);

      if (event.result && event.result.ui_action === 'open_upload') {
        if (window.preview) window.preview.switchTab('drive');
        if (window.openUploadDialog) window.openUploadDialog(event.result.folderName);
      }

      if (event.result && event.result.status === 'awaiting_user_confirmation') {
        const actionCard = `
          <div class="pending-action-card" id="action-card-${event.result.actionId}" style="border: 1px solid var(--gold); background: rgba(245, 197, 66, 0.08); padding: 10px 12px; margin: 8px 0;">
            <div style="color: var(--gold); font-weight: 700; font-size: 11px; letter-spacing: 0.1em; margin-bottom: 4px;">// ACTION CONFIRMATION REQUIRED</div>
            <div style="font-size: 12px; margin-bottom: 4px;">Telegram message to <b>${window.esc(event.result.recipient)}</b>:</div>
            <blockquote style="margin: 4px 0 8px; border-left: 2px solid var(--gold); padding-left: 8px; color: var(--bone);">“${window.esc(event.result.message)}”</blockquote>
            <div style="display: flex; gap: 8px;" id="action-btns-${event.result.actionId}">
              <button class="b" data-confirm-action="${event.result.actionId}" style="margin: 0; padding: 4px 12px; font-size: 11px;">Confirm &amp; Send</button>
              <button class="b alt" data-cancel-action="${event.result.actionId}" style="margin: 0; padding: 4px 12px; font-size: 11px;">Cancel</button>
            </div>
          </div>
        `;
        window.chat.addMessage('j', actionCard);
      }

      // Automatically sync and switch preview panes
      if (event.tool === 'create_calendar_event' && window.refreshCalendar) {
        window.refreshCalendar(event.result && event.result.id);
        if (window.preview) window.preview.switchTab('cal');
      } else if (event.tool === 'create_reminder' && window.refreshReminders) {
        window.refreshReminders(event.result && event.result.id);
        if (window.preview) window.preview.switchTab('rem');
      } else if (event.tool === 'search_drive' && window.refreshDrive) {
        if (window.preview) window.preview.switchTab('drive');
      } else if (event.tool === 'send_telegram_message' && window.refreshComms) {
        window.refreshComms();
      }
    } else if (event.status === 'error') {
      if (event.code === 'auth_expired') {
        window.dispatchEvent(new CustomEvent('auth-expired', { detail: { code: 'auth_expired' } }));
      }
    }
  } else if (event.type === 'message') {
    commandHistory.push({ role: 'user', text: userCommandText });
    commandHistory.push({ role: 'model', text: event.text });
    const formatted = window.esc(event.text).replace(/\n/g, '<br>');
    window.chat.addMessage('j', formatted);
  } else if (event.type === 'error') {
    window.chat.addMessage('e', `⚠ ${window.esc(event.message)}`);
  }
}

/**
 * Submit command to server via SSE stream.
 * @param {string} raw
 */
async function submitCommand(raw) {
  const text = (raw || '').trim();
  if (!text) return;

  window.chat.addMessage('u', window.esc(text));
  const inputEl = document.querySelector('#in');
  if (inputEl) inputEl.value = '';

  window.chat.setStatus('processing');
  window.queue.enqueue(text);

  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const nowISO = new Date().toISOString();

  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        text,
        history: commandHistory.slice(-10),
        timezone: browserTimezone,
        nowISO
      })
    });

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth-expired', { detail: { url: '/api/command', status: 401 } }));
      window.chat.setStatus('offline');
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop(); // Keep partial chunk in buffer

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          handleAgentEvent(event, text);
        } catch (e) {
          console.warn('[SSE] Could not parse event chunk:', jsonStr);
        }
      }
    }

    window.chat.setStatus('online');
    window.queue.dequeue();
  } catch (err) {
    window.chat.addMessage('e', `⚠ Command processing failed: ${window.esc(err.message)}`);
    window.chat.setStatus('online');
    window.queue.dequeue();
  }
}

/**
 * Initialize clock ticker.
 */
function initClock() {
  const clockEl = document.querySelector('#clock');
  function update() {
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }
  update();
  setInterval(update, 1000);
}

// Bind DOM Events
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  renderIntegrations();
  renderQuickChips();

  if (window.preview) {
    window.preview.renderTabs();
    window.preview.renderView();
  }

  if (window.queue) {
    window.queue.renderQueue();
  }

  // Handle Tab Navigation clicks
  const tabsContainer = document.querySelector('#tabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (btn && btn.dataset.t && window.preview) {
        window.preview.switchTab(btn.dataset.t);
      }
    });
  }

  // Handle Mode Toggle
  const modeBtn = document.querySelector('#mode');
  if (modeBtn && window.queue) {
    modeBtn.addEventListener('click', () => {
      window.queue.toggleMode();
    });
  }

  // Handle Command Submission
  const sendBtn = document.querySelector('#go');
  const inputField = document.querySelector('#in');

  if (sendBtn && inputField) {
    sendBtn.addEventListener('click', () => submitCommand(inputField.value));
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitCommand(inputField.value);
    });
  }

  // Handle Logout Button
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await window.api.post('/auth/logout');
        setAuthState(false);
        if (window.chat && window.chat.showToast) {
          window.chat.showToast('Logged out successfully');
        }
      } catch (err) {
        console.error('Logout failed:', err);
        setAuthState(false);
      }
    });
  }

  // Handle global auth-expired event
  window.addEventListener('auth-expired', () => {
    const banner = document.querySelector('#auth-expired-banner');
    if (banner) {
      banner.style.display = 'flex';
    }
    window.chat.setStatus('offline');
    window.chat.addMessage('e', '⚠ Google authorization expired. Please click "Reconnect Google" above.');
    if (window.chat && window.chat.showToast) {
      window.chat.showToast('Google authorization expired. Reconnect required.');
    }
  });

  // Handle Pending Actions Confirmation & Cancellation
  document.addEventListener('click', async (e) => {
    const confirmBtn = e.target.closest('button[data-confirm-action]');
    if (confirmBtn) {
      const actionId = confirmBtn.dataset.confirmAction;
      const btnsContainer = document.querySelector(`#action-btns-${actionId}`);
      if (btnsContainer) {
        btnsContainer.innerHTML = '<span style="color: var(--dim); font-size: 11px;">Transmitting via Telegram…</span>';
      }

      try {
        await window.api.post(`/api/actions/${actionId}/confirm`);
        if (btnsContainer) {
          btnsContainer.innerHTML = '<span style="color: var(--ok); font-size: 11px; font-weight: 700;">✓ TRANSMISSION CONFIRMED &amp; SENT</span>';
        }
        if (window.chat && window.chat.showToast) {
          window.chat.showToast('Telegram message sent');
        }
        if (window.refreshComms) {
          window.refreshComms();
        }
      } catch (err) {
        if (btnsContainer) {
          btnsContainer.innerHTML = `<span style="color: var(--err); font-size: 11px;">Error: ${window.esc(err.message)}</span>`;
        }
      }
      return;
    }

    const cancelBtn = e.target.closest('button[data-cancel-action]');
    if (cancelBtn) {
      const actionId = cancelBtn.dataset.cancelAction;
      const btnsContainer = document.querySelector(`#action-btns-${actionId}`);
      if (btnsContainer) {
        btnsContainer.innerHTML = '<span style="color: var(--dim); font-size: 11px;">Cancelling…</span>';
      }

      try {
        await window.api.post(`/api/actions/${actionId}/cancel`);
        if (btnsContainer) {
          btnsContainer.innerHTML = '<span style="color: var(--dim); font-size: 11px;">✕ TRANSMISSION CANCELLED</span>';
        }
        if (window.chat && window.chat.showToast) {
          window.chat.showToast('Action cancelled');
        }
        if (window.refreshComms) {
          window.refreshComms();
        }
      } catch (err) {
        if (btnsContainer) {
          btnsContainer.innerHTML = `<span style="color: var(--err); font-size: 11px;">Error: ${window.esc(err.message)}</span>`;
        }
      }
      return;
    }
  });

  // Initial welcome message in console
  window.chat.addMessage('j', 'Stark Command Centre online. Awaiting your command.');

  // Check initial authentication state
  checkAuth();
});

window.setAuthState = setAuthState;
