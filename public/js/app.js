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

/**
 * Switch page visibility between Logged Out and Logged In views.
 * @param {boolean} isLoggedIn
 */
function setAuthState(isLoggedIn) {
  const authView = document.querySelector('#auth-view');
  const mainView = document.querySelector('#main-view');

  if (isLoggedIn) {
    if (authView) authView.style.display = 'none';
    if (mainView) mainView.style.display = 'grid';
  } else {
    if (authView) authView.style.display = 'flex';
    if (mainView) mainView.style.display = 'none';
  }
}

/**
 * Check authentication status with the server.
 */
async function checkAuth() {
  // Allow manual query param ?view=app or ?mock=1 to inspect command centre
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'app' || params.get('mock') === '1') {
    setAuthState(true);
    return;
  }

  try {
    const data = await window.api.get('/api/auth/status');
    if (data && data.authenticated) {
      setAuthState(true);
    } else {
      setAuthState(false);
    }
  } catch (err) {
    // Default to logged out state if server returns 401 or is starting up
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
    <span class="hint">Service link states (live status will be synced from server)</span>
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

  // Handle global auth-expired event
  window.addEventListener('auth-expired', () => {
    setAuthState(false);
    if (window.chat && window.chat.showToast) {
      window.chat.showToast('Session expired. Please reconnect Google.');
    }
  });

  // Initial welcome message in console
  window.chat.addMessage('j', 'Stark Command Centre initialized. Awaiting your command.');

  // Check initial authentication
  checkAuth();
});

window.setAuthState = setAuthState;
