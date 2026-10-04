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

  if (isLoggedIn) {
    if (authView) authView.style.display = 'none';
    if (mainView) mainView.style.display = 'grid';
    if (userProfile) userProfile.style.display = 'flex';
    if (userNameEl && user) {
      userNameEl.textContent = user.name || user.email || 'Tony Stark';
    }
  } else {
    if (authView) authView.style.display = 'flex';
    if (mainView) mainView.style.display = 'none';
    if (userProfile) userProfile.style.display = 'none';
    if (authBanner) authBanner.style.display = 'none';
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
    return;
  }

  try {
    const user = await window.api.get('/api/me');
    setAuthState(true, user);

    if (window.refreshCalendar) {
      window.refreshCalendar();
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

/**
 * Submit command to server without frontend keyword parsing.
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

  try {
    const res = await window.api.post('/api/command', { command: text });
    if (res && res.message) {
      window.chat.addMessage('j', res.message);
    }
    window.chat.setStatus('online');
  } catch (err) {
    if (err.status !== 401) {
      window.chat.addMessage('e', `⚠ Command processing failed: ${window.esc(err.message)}`);
    }
    window.chat.setStatus('online');
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

  // Initial welcome message in console
  window.chat.addMessage('j', 'Stark Command Centre online. Awaiting your command.');

  // Check initial authentication state
  checkAuth();
});

window.setAuthState = setAuthState;
