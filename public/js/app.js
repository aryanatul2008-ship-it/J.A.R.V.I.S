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

    // Refresh integration status and restore any pending confirmation cards
    refreshStatus();
    restorePendingActions();

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

let integrationStatus = {
  calendar: 'unknown',
  drive: 'unknown',
  telegram: 'unknown',
  ai: 'unknown'
};

/**
 * Fetch live integration health status from GET /api/status.
 */
async function refreshStatus() {
  if (!currentUser) return;

  try {
    const res = await window.api.get('/api/status');
    if (res) {
      integrationStatus = {
        calendar: res.calendar || 'unavailable',
        drive: res.drive || 'unavailable',
        telegram: res.telegram || 'unavailable',
        ai: res.ai || 'unavailable'
      };
      renderIntegrations();

      // Show reconnect banner if authorization expired on Google services
      if (res.calendar === 'auth_expired' || res.drive === 'auth_expired') {
        const banner = document.querySelector('#auth-expired-banner');
        if (banner) banner.style.display = 'flex';
      }
    }
  } catch (err) {
    console.warn('[STATUS] Could not refresh integration status:', err.message);
  }
}

/**
 * Render integration status chips with live state and failure reasons.
 */
function renderIntegrations() {
  const integ = document.querySelector('#integ');
  if (!integ) return;

  const renderChip = (key, label, state) => {
    let cls = '';
    let statusText = 'ONLINE';

    if (state === 'online') {
      cls = '';
      statusText = 'ONLINE';
    } else if (state === 'auth_expired') {
      cls = 'off';
      statusText = 'AUTH EXPIRED';
    } else if (state === 'unavailable') {
      cls = 'off';
      statusText = 'UNAVAILABLE';
    } else {
      cls = 'unknown';
      statusText = 'UNKNOWN';
    }

    const isAuth = state === 'auth_expired';
    return `<button class="chip ${cls}" data-k="${key}" ${isAuth ? 'data-action="reconnect"' : ''} title="${isAuth ? 'Google authorization expired. Click to reconnect.' : ''}"><i></i>${label} · ${statusText}</button>`;
  };

  integ.innerHTML = `
    ${renderChip('cal', 'CALENDAR', integrationStatus.calendar)}
    ${renderChip('drive', 'DRIVE', integrationStatus.drive)}
    ${renderChip('tg', 'TELEGRAM', integrationStatus.telegram)}
    ${renderChip('ai', 'AI CORE', integrationStatus.ai)}
    <span class="hint">Service link states (synced live)</span>
  `;
}

/**
 * Safety net: restore pending confirmation cards across page reloads.
 */
async function restorePendingActions() {
  try {
    const res = await window.api.get('/api/actions/pending');
    const pendingList = (res && res.pending) || [];
    pendingList.forEach((action) => {
      // Avoid duplicate confirmation cards
      if (document.querySelector(`#action-card-${action.id}`)) {
        return;
      }

      const args = typeof action.args === 'string' ? JSON.parse(action.args) : (action.args || {});
      const recipient = args.recipient || 'Contact';
      const message = args.message || '';

      if (window.chat && window.chat.renderConfirmationCard) {
        window.chat.renderConfirmationCard(action.id, recipient, message);
      }
    });
  } catch (err) {
    console.warn('[PENDING ACTIONS] Could not restore pending confirmations:', err.message);
  }
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
    btn.onclick = () => {
      if (window.queue && window.queue.submit) {
        window.queue.submit(cmd);
      }
    };
    container.appendChild(btn);
  });
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
    sendBtn.addEventListener('click', () => {
      if (window.queue && window.queue.submit) {
        window.queue.submit(inputField.value);
      }
    });
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (window.queue && window.queue.submit) {
          window.queue.submit(inputField.value);
        }
      }
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

  // Handle clicking reconnect on integration chips
  const integEl = document.querySelector('#integ');
  if (integEl) {
    integEl.addEventListener('click', (e) => {
      const chip = e.target.closest('button.chip');
      if (chip && chip.dataset.action === 'reconnect') {
        window.location.href = '/auth/google';
      }
    });
  }

  // Poll integration status every 60 seconds
  setInterval(refreshStatus, 60000);

  // Initial welcome message in console
  window.chat.addMessage('j', 'Stark Command Centre online. Awaiting your command.');

  // Check initial authentication state
  checkAuth();
});

window.setAuthState = setAuthState;
window.refreshStatus = refreshStatus;
window.restorePendingActions = restorePendingActions;
