/**
 * preview.js - Live preview tabs & views (Calendar, Reminders, Drive, Comms, History)
 */

const PREVIEW_TABS = [
  ['cal', 'Calendar'],
  ['rem', 'Reminders'],
  ['drive', 'Drive'],
  ['comms', 'Comms'],
  ['hist', 'History']
];

const previewState = {
  activeTab: 'cal',
  loading: false,
  lastNewEventId: null,
  lastNewReminderId: null,
  data: {
    cal: [],
    rem: [],
    drive: [],
    comms: [],
    hist: []
  }
};

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDay(d) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (d.toDateString() === today.toDateString()) {
    return `Today (${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })})`;
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow (${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })})`;
  }
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Render the tab list header in the Live Preview panel.
 */
function renderTabs() {
  const container = document.querySelector('#tabs');
  if (!container) return;

  container.innerHTML = PREVIEW_TABS.map(([key, label]) => {
    const isSelected = previewState.activeTab === key;
    return `<button class="tab" role="tab" data-t="${key}" aria-selected="${isSelected}">${label.toUpperCase()}</button>`;
  }).join('');
}

/**
 * Switch the active preview tab and fetch fresh data if needed.
 * @param {string} tabKey
 */
function switchTab(tabKey) {
  previewState.activeTab = tabKey;
  renderTabs();
  renderView();

  if (tabKey === 'cal') {
    refreshCalendar();
  } else if (tabKey === 'rem') {
    refreshReminders();
  }
}

/**
 * Fetch and refresh calendar events from the server.
 * @param {string} [newId] - Optional ID of newly added event to flash in UI
 */
async function refreshCalendar(newId = null) {
  if (newId) {
    previewState.lastNewEventId = newId;
  }

  try {
    previewState.loading = true;
    const res = await window.api.get('/api/calendar/events');
    const events = Array.isArray(res) ? res : (res && res.events) || [];
    previewState.data.cal = events;
  } catch (err) {
    console.warn('[CALENDAR] Unable to fetch calendar events:', err.message);
  } finally {
    previewState.loading = false;
    if (previewState.activeTab === 'cal') {
      renderView();
    }
    if (newId) {
      setTimeout(() => {
        if (previewState.lastNewEventId === newId) {
          previewState.lastNewEventId = null;
        }
      }, 2500);
    }
  }
}

/**
 * Fetch and refresh active reminders from the server.
 * @param {number|string} [newId] - Optional ID of newly added reminder to flash in UI
 */
async function refreshReminders(newId = null) {
  if (newId) {
    previewState.lastNewReminderId = newId;
  }

  try {
    const res = await window.api.get('/api/reminders?scope=upcoming');
    const reminders = Array.isArray(res) ? res : (res && res.reminders) || [];
    previewState.data.rem = reminders;
  } catch (err) {
    console.warn('[REMINDERS] Unable to fetch reminders:', err.message);
  } finally {
    if (previewState.activeTab === 'rem') {
      renderView();
    }
    if (newId) {
      setTimeout(() => {
        if (previewState.lastNewReminderId === newId) {
          previewState.lastNewReminderId = null;
        }
      }, 2500);
    }
  }
}

/**
 * Render calendar events grouped by date.
 */
function renderCalendarView(events) {
  if (!events || events.length === 0) {
    return '<div class="empty">No events scheduled.</div>';
  }

  const sorted = events.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  const grouped = {};

  sorted.forEach((event) => {
    const dateObj = new Date(event.start);
    const dayKey = isNaN(dateObj.getTime()) ? 'Unscheduled' : fmtDay(dateObj);
    if (!grouped[dayKey]) {
      grouped[dayKey] = [];
    }
    grouped[dayKey].push({ event, dateObj });
  });

  let html = '';
  Object.keys(grouped).forEach((dayKey) => {
    html += `<div class="fold">▸ ${esc(dayKey)}</div>`;
    grouped[dayKey].forEach(({ event, dateObj }) => {
      const isNew = previewState.lastNewEventId && String(previewState.lastNewEventId) === String(event.id);
      const timeStr = isNaN(dateObj.getTime()) ? 'All day' : fmtTime(dateObj);

      html += `
        <div class="row${isNew ? ' new' : ''}">
          <span class="tag">EVENT</span>
          <b>${esc(event.title)}</b>
          <span>${esc(timeStr)}</span>
          <small>
            ${event.description ? esc(event.description) + ' · ' : ''}
            ${event.htmlLink ? `<a href="${esc(event.htmlLink)}" target="_blank" rel="noopener noreferrer" class="lnk">Open in Google Calendar</a>` : ''}
          </small>
        </div>
      `;
    });
  });

  return html;
}

/**
 * Render active reminders with amber REMINDER tag and Dismiss button.
 */
function renderRemindersView(reminders) {
  if (!reminders || reminders.length === 0) {
    return '<div class="empty">No active reminders.</div>';
  }

  const sorted = reminders.slice().sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  return sorted.map((r) => {
    const dueDate = new Date(r.due_at);
    const isNew = previewState.lastNewReminderId && String(previewState.lastNewReminderId) === String(r.id);
    const timeStr = isNaN(dueDate.getTime()) ? '' : fmtTime(dueDate);
    const dayStr = isNaN(dueDate.getTime()) ? '' : fmtDay(dueDate);

    return `
      <div class="row${isNew ? ' new' : ''}">
        <span class="tag r">REMINDER</span>
        <b>${esc(r.text)}</b>
        <span>${esc(timeStr)}</span>
        <small>
          ${esc(dayStr)} · <button class="lnk" data-dismiss="${esc(r.id)}">Dismiss</button>
        </small>
      </div>
    `;
  }).join('');
}

/**
 * Render the content for the currently active tab.
 */
function renderView() {
  const viewEl = document.querySelector('#view');
  if (!viewEl) return;

  const currentTab = previewState.activeTab;

  if (currentTab === 'cal') {
    viewEl.innerHTML = renderCalendarView(previewState.data.cal);
    return;
  }

  if (currentTab === 'rem') {
    viewEl.innerHTML = renderRemindersView(previewState.data.rem);
    return;
  }

  const items = previewState.data[currentTab] || [];

  if (items.length === 0) {
    let emptyMsg = 'No records found.';
    switch (currentTab) {
      case 'drive':
        emptyMsg = 'No files in Drive.';
        break;
      case 'comms':
        emptyMsg = 'No messages sent yet.';
        break;
      case 'hist':
        emptyMsg = 'No action history recorded.';
        break;
    }
    viewEl.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    return;
  }

  viewEl.innerHTML = `<div class="empty">${items.length} items available.</div>`;
}

/**
 * Update tab data from backend services.
 * @param {string} tabKey
 * @param {Array} items
 */
function setTabData(tabKey, items) {
  if (previewState.data[tabKey] !== undefined) {
    previewState.data[tabKey] = items;
    if (previewState.activeTab === tabKey) {
      renderView();
    }
  }
}

// Global click delegation for reminder dismissal
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-dismiss]');
  if (!btn) return;

  const reminderId = btn.dataset.dismiss;
  btn.disabled = true;

  try {
    await window.api.post(`/api/reminders/${reminderId}/dismiss`);
    if (window.chat && window.chat.showToast) {
      window.chat.showToast('Reminder dismissed');
    }
    refreshReminders();
  } catch (err) {
    console.error('Failed to dismiss reminder:', err);
    if (window.chat && window.chat.showToast) {
      window.chat.showToast(`Error: ${err.message}`);
    }
    btn.disabled = false;
  }
});

window.refreshCalendar = refreshCalendar;
window.refreshReminders = refreshReminders;
window.preview = {
  renderTabs,
  switchTab,
  renderView,
  setTabData,
  refreshCalendar,
  refreshReminders,
  getActiveTab: () => previewState.activeTab
};
