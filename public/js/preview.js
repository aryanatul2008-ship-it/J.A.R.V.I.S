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
  tabLoading: {
    cal: false,
    rem: false,
    drive: false,
    comms: false,
    hist: false
  },
  tabError: {
    cal: null,
    rem: null,
    drive: null,
    comms: null,
    hist: null
  },
  historyFilter: 'all', // 'all' | 'failed'
  lastNewEventId: null,
  lastNewReminderId: null,
  lastNewCommsId: null,
  editingContactId: null,
  userInfo: null,
  data: {
    cal: [],
    rem: [],
    drive: [],
    contacts: [],
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
 * Render skeleton loading rows for tabs.
 * @param {string} [tab]
 * @returns {string}
 */
function renderSkeleton(tab) {
  return `
    <div class="skeleton-list" aria-busy="true" aria-label="Loading content">
      <div class="skeleton-row">
        <div class="sk-tag"></div>
        <div class="sk-title"></div>
        <div class="sk-sub"></div>
      </div>
      <div class="skeleton-row">
        <div class="sk-tag"></div>
        <div class="sk-title" style="width: 55%;"></div>
        <div class="sk-sub" style="width: 35%;"></div>
      </div>
      <div class="skeleton-row">
        <div class="sk-tag"></div>
        <div class="sk-title" style="width: 70%;"></div>
        <div class="sk-sub" style="width: 45%;"></div>
      </div>
    </div>
  `;
}

/**
 * Render error container with retry button.
 * @param {string} tabKey
 * @param {string} errorMessage
 * @returns {string}
 */
function renderTabError(tabKey, errorMessage) {
  return `
    <div class="tab-error-box" role="alert">
      <div class="tab-error-msg">⚠ ${esc(errorMessage || 'Failed to load data')}</div>
      <button class="b alt retry-btn" data-retry-tab="${esc(tabKey)}" aria-label="Retry loading ${esc(tabKey)}">RETRY</button>
    </div>
  `;
}

/**
 * Render the tab list header in the Live Preview panel.
 */
function renderTabs() {
  const container = document.querySelector('#tabs');
  if (!container) return;

  container.innerHTML = PREVIEW_TABS.map(([key, label]) => {
    const isSelected = previewState.activeTab === key;
    return `<button class="tab" role="tab" data-t="${key}" aria-selected="${isSelected}" aria-label="${label} tab">${label.toUpperCase()}</button>`;
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
  } else if (tabKey === 'comms') {
    refreshComms();
  } else if (tabKey === 'hist') {
    refreshHistory();
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

  previewState.tabLoading.cal = true;
  previewState.tabError.cal = null;
  if (previewState.activeTab === 'cal') {
    renderView();
  }

  try {
    const res = await window.api.get('/api/calendar/events');
    const events = Array.isArray(res) ? res : (res && res.events) || [];
    previewState.data.cal = events;
    previewState.tabError.cal = null;
  } catch (err) {
    console.warn('[CALENDAR] Unable to fetch calendar events:', err.message);
    previewState.tabError.cal = err.message || 'Unable to fetch calendar events';
  } finally {
    previewState.tabLoading.cal = false;
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

  previewState.tabLoading.rem = true;
  previewState.tabError.rem = null;
  if (previewState.activeTab === 'rem') {
    renderView();
  }

  try {
    const res = await window.api.get('/api/reminders?scope=upcoming');
    const reminders = Array.isArray(res) ? res : (res && res.reminders) || [];
    previewState.data.rem = reminders;
    previewState.tabError.rem = null;
  } catch (err) {
    console.warn('[REMINDERS] Unable to fetch reminders:', err.message);
    previewState.tabError.rem = err.message || 'Unable to fetch reminders';
  } finally {
    previewState.tabLoading.rem = false;
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

  previewState.tabLoading.drive = true;
  previewState.tabError.drive = null;
  if (previewState.activeTab === 'drive') {
    renderView();
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
    previewState.tabError.drive = null;
  } catch (err) {
    console.warn('[DRIVE] Unable to load Drive explorer:', err.message);
    previewState.tabError.drive = err.message || 'Unable to load Drive files';
  } finally {
    previewState.tabLoading.drive = false;
    if (previewState.activeTab === 'drive') {
      renderView();
    }
    if (window.upload && window.upload.loadDestinationFolders) {
      window.upload.loadDestinationFolders();
    }
  }
}

/**
 * Display Drive search results directly or perform a Drive search query.
 * @param {string} query
 * @param {Array} [files]
 */
async function showDriveSearchResults(query, files = null) {
  driveState.searchQuery = query || '';
  driveState.isSearching = Boolean(query);

  if (Array.isArray(files) && files.length > 0 && (files[0].webViewLink || files[0].link)) {
    previewState.data.drive = files.map(f => ({
      id: f.id,
      name: f.name,
      isFolder: Boolean(f.isFolder),
      webViewLink: f.webViewLink || f.link,
      modifiedTime: f.modifiedTime || f.modified,
      folderName: f.folderName || f.folder,
      size: f.size
    }));
    previewState.tabLoading.drive = false;
    previewState.tabError.drive = null;
    if (previewState.activeTab === 'drive') {
      renderView();
    }
  } else {
    await refreshDrive();
  }

  switchTab('drive');
}

async function searchDrive(query) {
  return showDriveSearchResults(query);
}

/**
 * Fetch and refresh Telegram contacts and comms history from the server.
 * @param {string|number} [newId] - Optional ID of newly added comms message to flash in UI
 */
async function refreshComms(newId = null) {
  if (newId) {
    previewState.lastNewCommsId = newId;
  }

  previewState.tabLoading.comms = true;
  previewState.tabError.comms = null;
  if (previewState.activeTab === 'comms') {
    renderView();
  }

  try {
    const [contactsRes, commsRes] = await Promise.all([
      window.api.get('/api/contacts').catch((e) => { throw e; }),
      window.api.get('/api/comms').catch((e) => { throw e; })
    ]);

    previewState.data.contacts = Array.isArray(contactsRes) ? contactsRes : [];
    previewState.data.comms = Array.isArray(commsRes) ? commsRes : [];
    previewState.tabError.comms = null;
  } catch (err) {
    console.warn('[COMMS] Unable to refresh comms:', err.message);
    previewState.tabError.comms = err.message || 'Unable to refresh contacts and communications';
  } finally {
    previewState.tabLoading.comms = false;
    if (previewState.activeTab === 'comms') {
      renderView();
    }
  }
}

/**
 * Fetch and refresh action execution history from the server.
 */
async function refreshHistory() {
  previewState.tabLoading.hist = true;
  previewState.tabError.hist = null;
  if (previewState.activeTab === 'hist') {
    renderView();
  }

  try {
    const res = await window.api.get('/api/history?limit=50');
    previewState.data.hist = (res && res.history) || [];
    previewState.tabError.hist = null;
  } catch (err) {
    console.warn('[HISTORY] Unable to refresh history:', err.message);
    previewState.tabError.hist = err.message || 'Unable to refresh action history';
  } finally {
    previewState.tabLoading.hist = false;
    if (previewState.activeTab === 'hist') {
      renderView();
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
      <input id="drive-search-input" aria-label="Search Drive files" value="${esc(driveState.searchQuery)}" placeholder="Search files and content in Drive…">
      <button class="b" id="drive-search-btn" aria-label="Search Drive files">Search</button>
      ${driveState.isSearching ? '<button class="b alt" id="drive-clear-search-btn" aria-label="Show all files">Show all files</button>' : ''}
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
      html += `<p class="path"><button class="lnk" data-nav-folder="${esc(parentId)}" style="margin-right: 6px;" aria-label="Go back to parent folder">‹ Back</button> Drive / <b>${esc(driveState.currentFolder.name)}</b></p>`;
    }
  }

  // 3. Upload Area
  html += `
    <div class="drive-upload-box" id="drive-upload-box">
      <div class="ph" style="padding: 0 0 6px 0; border: none;">// UPLOAD DOCUMENT</div>
      <div class="drive-upload-row">
        <label class="b alt" style="cursor: pointer; margin: 0;">
          Choose file
          <input type="file" id="drive-file-input" aria-label="Choose file to upload" style="display: none;">
        </label>
        <span id="drive-selected-file-label" style="color: var(--dim); font-size: 12px;">No file chosen</span>
      </div>
      <div class="drive-upload-row">
        <span style="color: var(--dim); font-size: 12px;">Destination:</span>
        <select id="drive-folder-select" class="drive-select" aria-label="Destination folder"></select>
        <div id="drive-new-folder-wrap" style="display: none;">
          <input id="drive-new-folder-input" class="drive-input" aria-label="New folder name" placeholder="New folder name…">
        </div>
        <button class="b" id="drive-upload-btn" style="margin-left: auto;" aria-label="Upload selected file to Drive">Upload to Drive</button>
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
          <b><button class="lnk" data-folder-id="${esc(f.id)}" aria-label="Open folder ${esc(f.name)}" style="font-weight: 700; font-size: 13px; border: none; padding: 0; background: none; color: var(--g); text-align: left;">📁 ${esc(f.name)}</button></b>
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
          ${f.webViewLink ? `<a href="${esc(f.webViewLink)}" target="_blank" rel="noopener noreferrer" class="lnk" aria-label="Open file ${esc(f.name)} in Google Drive">Open</a>` : '<span></span>'}
          <small>${f.folderName ? esc(f.folderName) + ' · ' : ''}${f.modifiedTime ? 'modified ' + fmtDay(new Date(f.modifiedTime)) : ''}${f.size ? ' · ' + Math.round(f.size / 1024) + ' KB' : ''}</small>
        </div>
      `;
    }
  });

  return html;
}

/**
 * Render Telegram contacts with inline editing and transmission history.
 * @param {Array} contacts
 * @param {Array} comms
 */
function renderCommsView(contacts, comms) {
  let html = '';
  const user = previewState.userInfo || window.currentUser || {};
  const inviteLink = user.inviteLink || (user.inviteCode ? `https://t.me/zesty_jarvis_bot?start=${user.inviteCode}` : '');
  const selfInviteLink = user.selfInviteLink || (user.inviteCode ? `https://t.me/zesty_jarvis_bot?start=self_${user.inviteCode}` : '');

  // 1. Contacts Section Header
  html += '<div class="fold">▸ CONTACTS & TELEGRAM LINKING</div>';

  // 2. Invite Link & Bot Linking Controls
  html += `
    <div class="comms-invite-box">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 11px; color: var(--dim); font-weight: 700; letter-spacing: 0.1em;">INVITE CONTACTS TO JARVIS:</span>
        <span class="tag ${user.telegramLinked ? '' : 'r'}">${user.telegramLinked ? 'REMINDERS LINKED' : 'REMINDERS UNLINKED'}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
        <input type="text" readonly value="${esc(inviteLink)}" id="comms-invite-input" aria-label="Telegram invite link" class="drive-input" style="flex: 1; font-size: 11px;" placeholder="Invite link available after sign-in">
        <button class="b" id="comms-copy-btn" aria-label="Copy Telegram invite link" style="margin: 0; padding: 5px 14px; font-size: 11px; min-height: 40px;">Copy Link</button>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        ${selfInviteLink ? `<a href="${esc(selfInviteLink)}" target="_blank" rel="noopener noreferrer" class="b alt" aria-label="Link your Telegram for reminders" style="margin: 0; padding: 4px 14px; font-size: 11px; text-decoration: none; min-height: 40px;">Link my Telegram for reminders</a>` : ''}
        <span style="color: var(--dim); font-size: 11px;">Recipients must open your invite link once to start chat.</span>
      </div>
    </div>
  `;

  // 3. Contacts Rows (with inline editing)
  if (!contacts || contacts.length === 0) {
    html += '<div class="empty" style="padding: 16px 10px; margin-bottom: 12px;">No contacts connected yet. Share your invite link above.</div>';
  } else {
    contacts.forEach((c) => {
      const isEditing = previewState.editingContactId === c.id;
      const aliasesList = Array.isArray(c.aliases) ? c.aliases : [];
      const aliasesStr = aliasesList.join(', ');

      if (isEditing) {
        html += `
          <div class="contact-row editing" id="contact-row-${c.id}">
            <div class="contact-edit-form">
              <span style="font-size: 11px; color: var(--gold); font-weight: 700;">EDIT CONTACT</span>
              <div class="contact-edit-inputs">
                <input id="contact-edit-name-${c.id}" aria-label="Contact name" value="${esc(c.name)}" placeholder="Contact name…">
                <input id="contact-edit-aliases-${c.id}" aria-label="Contact aliases" value="${esc(aliasesStr)}" placeholder="Aliases (comma-separated, e.g. Bruce, Hulk)…">
              </div>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <button class="b" data-save-contact="${c.id}" aria-label="Save contact" style="margin: 0; padding: 3px 12px; font-size: 11px; min-height: 40px;">Save</button>
                <button class="b alt" data-cancel-contact="${c.id}" aria-label="Cancel editing contact" style="margin: 0; padding: 3px 12px; font-size: 11px; min-height: 40px;">Cancel</button>
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="contact-row" id="contact-row-${c.id}">
            <span class="tag">CONTACT</span>
            <div>
              <b>${esc(c.name)}</b>
              <div style="font-size: 11px; color: var(--dim); margin-top: 2px;">
                Aliases: ${aliasesList.length > 0 ? `<span style="color: var(--bone);">${esc(aliasesStr)}</span>` : '<em style="color: var(--dim);">None</em>'}
              </div>
            </div>
            <div class="contact-actions">
              <button class="contact-btn" data-edit-contact="${c.id}" aria-label="Edit contact ${esc(c.name)}">Edit</button>
              <button class="contact-btn del" data-delete-contact="${c.id}" aria-label="Delete contact ${esc(c.name)}">Delete</button>
            </div>
          </div>
        `;
      }
    });
  }

  // 4. Transmission History Header
  html += '<div class="fold" style="margin-top: 18px;">▸ TRANSMISSION HISTORY</div>';

  // 5. Comms History Rows
  if (!comms || comms.length === 0) {
    html += '<div class="empty">No messages sent yet.</div>';
  } else {
    comms.forEach((m) => {
      const createdDate = new Date(m.created_at);
      const timeStr = isNaN(createdDate.getTime()) ? '' : fmtTime(createdDate);
      const isNew = previewState.lastNewCommsId && String(previewState.lastNewCommsId) === String(m.id);

      let tagClass = '';
      let statusText = (m.status || 'sent').toUpperCase();
      if (m.status === 'sent') {
        tagClass = '';
      } else if (m.status === 'failed') {
        tagClass = 'bad';
      } else if (m.status === 'cancelled') {
        tagClass = 'bad';
      }

      html += `
        <div class="row${isNew ? ' new' : ''}">
          <span class="tag ${tagClass}">${esc(statusText)}</span>
          <b>To ${esc(m.recipient_name)}</b>
          <span>${esc(timeStr)}</span>
          <small>
            “${esc(m.body)}” · ${esc(statusText)} · sent by JARVIS${m.error ? ` · <span style="color: var(--err);">${esc(m.error)}</span>` : ''}
          </small>
        </div>
      `;
    });
  }

  return html;
}

const TOOL_LABELS = {
  create_calendar_event: 'CALENDAR',
  list_calendar_events: 'CALENDAR',
  create_reminder: 'REMINDER',
  list_reminders: 'REMINDER',
  search_drive: 'DRIVE',
  request_file_upload: 'DRIVE UPLOAD',
  send_telegram_message: 'TELEGRAM'
};

/**
 * Render action_log execution history with status badges, failure details, and All/Failed filter.
 * @param {Array} history
 */
function renderHistoryView(history = []) {
  const filter = previewState.historyFilter || 'all';
  const allItems = Array.isArray(history) ? history : [];
  const failedItems = allItems.filter((item) => (item.status || '').toLowerCase() === 'failed');
  const items = filter === 'failed' ? failedItems : allItems;

  let html = `
    <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
      <button class="b ${filter === 'all' ? '' : 'alt'}" data-history-filter="all" aria-label="Show all history actions" style="margin: 0; padding: 4px 14px; font-size: 11px; min-height: 40px;">ALL (${allItems.length})</button>
      <button class="b ${filter === 'failed' ? '' : 'alt'}" data-history-filter="failed" aria-label="Show failed history actions only" style="margin: 0; padding: 4px 14px; font-size: 11px; min-height: 40px;">FAILED (${failedItems.length})</button>
    </div>
  `;

  if (items.length === 0) {
    html += `<div class="empty">${filter === 'failed' ? 'No failed actions recorded.' : 'No action history recorded yet.'}</div>`;
    return html;
  }

  items.forEach((item) => {
    const createdDate = new Date(item.created_at);
    const timeStr = isNaN(createdDate.getTime()) ? '' : fmtTime(createdDate);
    const dayStr = isNaN(createdDate.getTime()) ? '' : fmtDay(createdDate);
    const toolLabel = TOOL_LABELS[item.tool] || (item.tool || 'ACTION').toUpperCase();

    let tagClass = '';
    const status = (item.status || 'success').toLowerCase();
    if (status === 'failed') {
      tagClass = 'bad';
    } else if (status === 'cancelled') {
      tagClass = 'bad';
    } else if (status === 'pending') {
      tagClass = 'r';
    }

    html += `
      <div class="row">
        <span class="tag ${tagClass}">${esc(status.toUpperCase())}</span>
        <b>${esc(item.summary || toolLabel)}</b>
        <span>${esc(timeStr)}</span>
        <small>
          [${esc(toolLabel)}] ${esc(dayStr)}${item.error ? ` · <span style="color: var(--err); font-weight: 500;">⚠ ${esc(item.error)}</span>` : ''}
        </small>
      </div>
    `;
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

  // 1. Loading state: skeleton loading text
  if (previewState.tabLoading && previewState.tabLoading[currentTab]) {
    viewEl.innerHTML = renderSkeleton(currentTab);
    return;
  }

  // 2. Error state: error container with retry button
  if (previewState.tabError && previewState.tabError[currentTab]) {
    viewEl.innerHTML = renderTabError(currentTab, previewState.tabError[currentTab]);
    return;
  }

  // 3. Tab views
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

  if (currentTab === 'comms') {
    viewEl.innerHTML = renderCommsView(previewState.data.contacts, previewState.data.comms);
    return;
  }

  if (currentTab === 'hist') {
    viewEl.innerHTML = renderHistoryView(previewState.data.hist);
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

// Global click delegation for reminders, drive browsing, and retries
document.addEventListener('click', async (e) => {
  // Retry tab fetch button
  const retryBtn = e.target.closest('button[data-retry-tab]');
  if (retryBtn) {
    const tab = retryBtn.dataset.retryTab;
    if (tab === 'cal') {
      refreshCalendar();
    } else if (tab === 'rem') {
      refreshReminders();
    } else if (tab === 'drive') {
      refreshDrive();
    } else if (tab === 'comms') {
      refreshComms();
    } else if (tab === 'hist') {
      refreshHistory();
    }
    return;
  }
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

  // Copy invite link
  const copyBtn = e.target.closest('#comms-copy-btn');
  if (copyBtn) {
    const input = document.querySelector('#comms-invite-input');
    if (input && input.value) {
      navigator.clipboard.writeText(input.value).then(() => {
        if (window.chat && window.chat.showToast) {
          window.chat.showToast('Invite link copied to clipboard');
        }
      }).catch(() => {
        input.select();
        document.execCommand('copy');
        if (window.chat && window.chat.showToast) {
          window.chat.showToast('Invite link copied');
        }
      });
    }
    return;
  }

  // Edit contact
  const editContactBtn = e.target.closest('button[data-edit-contact]');
  if (editContactBtn) {
    const cId = parseInt(editContactBtn.dataset.editContact, 10);
    previewState.editingContactId = cId;
    renderView();
    return;
  }

  // Cancel edit contact
  const cancelContactBtn = e.target.closest('button[data-cancel-contact]');
  if (cancelContactBtn) {
    previewState.editingContactId = null;
    renderView();
    return;
  }

  // Save contact edit
  const saveContactBtn = e.target.closest('button[data-save-contact]');
  if (saveContactBtn) {
    const cId = parseInt(saveContactBtn.dataset.saveContact, 10);
    const nameInput = document.querySelector(`#contact-edit-name-${cId}`);
    const aliasesInput = document.querySelector(`#contact-edit-aliases-${cId}`);

    const name = nameInput ? nameInput.value.trim() : '';
    const aliasesRaw = aliasesInput ? aliasesInput.value.trim() : '';
    const aliases = aliasesRaw ? aliasesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    if (!name) {
      if (window.chat && window.chat.showToast) {
        window.chat.showToast('Name cannot be empty');
      }
      return;
    }

    saveContactBtn.disabled = true;
    try {
      await window.api.patch(`/api/contacts/${cId}`, { name, aliases });
      previewState.editingContactId = null;
      if (window.chat && window.chat.showToast) {
        window.chat.showToast('Contact updated');
      }
      refreshComms();
    } catch (err) {
      console.error('Failed to update contact:', err);
      if (window.chat && window.chat.showToast) {
        window.chat.showToast(`Error: ${err.message}`);
      }
      saveContactBtn.disabled = false;
    }
    return;
  }

  // Delete contact
  const deleteContactBtn = e.target.closest('button[data-delete-contact]');
  if (deleteContactBtn) {
    const cId = parseInt(deleteContactBtn.dataset.deleteContact, 10);
    if (!confirm('Are you sure you want to remove this contact?')) {
      return;
    }
    deleteContactBtn.disabled = true;
    try {
      await window.api.delete(`/api/contacts/${cId}`);
      if (window.chat && window.chat.showToast) {
        window.chat.showToast('Contact removed');
      }
      refreshComms();
    } catch (err) {
      console.error('Failed to delete contact:', err);
      if (window.chat && window.chat.showToast) {
        window.chat.showToast(`Error: ${err.message}`);
      }
      deleteContactBtn.disabled = false;
    }
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

// Handle history filter button clicks
document.addEventListener('click', (e) => {
  const filterBtn = e.target.closest('button[data-history-filter]');
  if (filterBtn) {
    previewState.historyFilter = filterBtn.dataset.historyFilter;
    renderView();
  }
});

window.refreshCalendar = refreshCalendar;
window.refreshReminders = refreshReminders;
window.refreshDrive = refreshDrive;
window.refreshComms = refreshComms;
window.refreshHistory = refreshHistory;
window.showDriveSearchResults = showDriveSearchResults;
window.searchDrive = searchDrive;
window.preview = {
  renderTabs,
  switchTab,
  renderView,
  setTabData,
  setUserInfo: (u) => {
    previewState.userInfo = u;
    if (previewState.activeTab === 'comms') {
      renderView();
    }
  },
  refreshCalendar,
  refreshReminders,
  refreshDrive,
  refreshComms,
  refreshHistory,
  showDriveSearchResults,
  searchDrive,
  getActiveTab: () => previewState.activeTab
};


