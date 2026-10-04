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

const driveState = {
  currentFolderId: 'root',
  currentFolder: { id: 'root', name: 'My Drive', parentId: null },
  searchQuery: '',
  isSearching: false
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
  } else if (tabKey === 'drive') {
    refreshDrive();
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
 * Fetch and refresh Google Drive files and folders.
 * @param {string} [folderId] - Optional folder ID to navigate to
 */
async function refreshDrive(folderId = null) {
  if (folderId !== null && folderId !== undefined) {
    driveState.currentFolderId = folderId;
    driveState.searchQuery = '';
    driveState.isSearching = false;
  }

  try {
    if (driveState.isSearching && driveState.searchQuery) {
      const res = await window.api.get(`/api/drive/search?q=${encodeURIComponent(driveState.searchQuery)}`);
      previewState.data.drive = (res && res.files) || [];
    } else {
      const res = await window.api.get(`/api/drive/list?folderId=${encodeURIComponent(driveState.currentFolderId || 'root')}`);
      previewState.data.drive = (res && res.files) || [];
      driveState.currentFolder = (res && res.folder) || { id: 'root', name: 'My Drive', parentId: null };
    }
  } catch (err) {
    console.warn('[DRIVE] Unable to load Drive explorer:', err.message);
  } finally {
    if (previewState.activeTab === 'drive') {
      renderView();
    }
    if (window.upload && window.upload.loadDestinationFolders) {
      window.upload.loadDestinationFolders();
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
 * Render Drive explorer: search box, breadcrumbs, upload area, and files/folders.
 */
function renderDriveView(files) {
  let html = '';

  // 1. Search Bar
  html += `
    <div class="drive-search-bar">
      <input id="drive-search-input" value="${esc(driveState.searchQuery)}" placeholder="Search files and content in Drive…">
      <button class="b" id="drive-search-btn">Search</button>
      ${driveState.isSearching ? '<button class="b alt" id="drive-clear-search-btn">Show all files</button>' : ''}
    </div>
  `;

  // 2. Breadcrumbs
  if (driveState.isSearching) {
    html += `<p class="path">Drive / search results for “${esc(driveState.searchQuery)}”</p>`;
  } else {
    const isRoot = !driveState.currentFolderId || driveState.currentFolderId === 'root';
    if (isRoot) {
      html += '<p class="path">Drive / My Drive</p>';
    } else {
      const parentId = driveState.currentFolder.parentId || 'root';
      html += `<p class="path"><button class="lnk" data-nav-folder="${esc(parentId)}" style="margin-right: 6px;">‹ Back</button> Drive / <b>${esc(driveState.currentFolder.name)}</b></p>`;
    }
  }

  // 3. Upload Area
  html += `
    <div class="drive-upload-box" id="drive-upload-box">
      <div class="ph" style="padding: 0 0 6px 0; border: none;">// UPLOAD DOCUMENT</div>
      <div class="drive-upload-row">
        <label class="b alt" style="cursor: pointer; margin: 0;">
          Choose file
          <input type="file" id="drive-file-input" style="display: none;">
        </label>
        <span id="drive-selected-file-label" style="color: var(--dim); font-size: 12px;">No file chosen</span>
      </div>
      <div class="drive-upload-row">
        <span style="color: var(--dim); font-size: 12px;">Destination:</span>
        <select id="drive-folder-select" class="drive-select"></select>
        <div id="drive-new-folder-wrap" style="display: none;">
          <input id="drive-new-folder-input" class="drive-input" placeholder="New folder name…">
        </div>
        <button class="b" id="drive-upload-btn" style="margin-left: auto;">Upload to Drive</button>
      </div>
      <div class="bar" id="drive-upload-progress" style="display: none;"><i></i></div>
      <div id="drive-upload-status" class="upload-status" style="display: none;"></div>
    </div>
  `;

  // 4. File and Folder Items
  if (!files || files.length === 0) {
    html += '<div class="empty">No matching files or folders.</div>';
    return html;
  }

  // Render Folders first, then files
  files.forEach((f) => {
    if (f.isFolder) {
      html += `
        <div class="row">
          <span class="tag">FOLDER</span>
          <b><button class="lnk" data-folder-id="${esc(f.id)}" style="font-weight: 700; font-size: 13px; border: none; padding: 0; background: none; color: var(--g);">📁 ${esc(f.name)}</button></b>
          <span></span>
          <small>${f.modifiedTime ? 'modified ' + fmtDay(new Date(f.modifiedTime)) : ''}</small>
        </div>
      `;
    } else {
      const ext = (f.name.split('.').pop() || 'FILE').toUpperCase();
      html += `
        <div class="row">
          <span class="tag">${esc(ext)}</span>
          <b>${esc(f.name)}</b>
          ${f.webViewLink ? `<a href="${esc(f.webViewLink)}" target="_blank" rel="noopener noreferrer" class="lnk">Open</a>` : '<span></span>'}
          <small>${f.folderName ? esc(f.folderName) + ' · ' : ''}${f.modifiedTime ? 'modified ' + fmtDay(new Date(f.modifiedTime)) : ''}${f.size ? ' · ' + Math.round(f.size / 1024) + ' KB' : ''}</small>
        </div>
      `;
    }
  });

  return html;
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

  if (currentTab === 'drive') {
    viewEl.innerHTML = renderDriveView(previewState.data.drive);
    if (window.upload && window.upload.loadDestinationFolders) {
      window.upload.loadDestinationFolders();
    }
    return;
  }

  const items = previewState.data[currentTab] || [];

  if (items.length === 0) {
    let emptyMsg = 'No records found.';
    switch (currentTab) {
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

// Global click delegation for reminders and drive browsing
document.addEventListener('click', async (e) => {
  // Reminder dismissal
  const dismissBtn = e.target.closest('button[data-dismiss]');
  if (dismissBtn) {
    const reminderId = dismissBtn.dataset.dismiss;
    dismissBtn.disabled = true;

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
      dismissBtn.disabled = false;
    }
    return;
  }

  // Folder navigation (entering a folder)
  const folderBtn = e.target.closest('button[data-folder-id]');
  if (folderBtn) {
    const fId = folderBtn.dataset.folderId;
    refreshDrive(fId);
    return;
  }

  // Breadcrumbs back navigation
  const backNavBtn = e.target.closest('button[data-nav-folder]');
  if (backNavBtn) {
    const parentId = backNavBtn.dataset.navFolder;
    refreshDrive(parentId);
    return;
  }

  // Drive search trigger
  const searchBtn = e.target.closest('#drive-search-btn');
  if (searchBtn) {
    const input = document.querySelector('#drive-search-input');
    if (input) {
      driveState.searchQuery = input.value.trim();
      driveState.isSearching = true;
      refreshDrive();
    }
    return;
  }

  // Clear search results
  const clearBtn = e.target.closest('#drive-clear-search-btn');
  if (clearBtn) {
    driveState.searchQuery = '';
    driveState.isSearching = false;
    refreshDrive();
    return;
  }
});

// Drive search input Enter key handler
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'drive-search-input') {
    driveState.searchQuery = e.target.value.trim();
    driveState.isSearching = true;
    refreshDrive();
  }
});

// Drag and drop support on Drive upload box
document.addEventListener('dragover', (e) => {
  const box = e.target.closest('#drive-upload-box');
  if (box) {
    e.preventDefault();
    box.classList.add('dragover');
  }
});

document.addEventListener('dragleave', (e) => {
  const box = e.target.closest('#drive-upload-box');
  if (box) {
    box.classList.remove('dragover');
  }
});

document.addEventListener('drop', (e) => {
  const box = e.target.closest('#drive-upload-box');
  if (box) {
    e.preventDefault();
    box.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const fileInput = document.querySelector('#drive-file-input');
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
      }
      const label = document.querySelector('#drive-selected-file-label');
      if (label) {
        label.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
      }
    }
  }
});

window.refreshCalendar = refreshCalendar;
window.refreshReminders = refreshReminders;
window.refreshDrive = refreshDrive;
window.preview = {
  renderTabs,
  switchTab,
  renderView,
  setTabData,
  refreshCalendar,
  refreshReminders,
  refreshDrive,
  getActiveTab: () => previewState.activeTab
};
