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
  data: {
    cal: [],
    rem: [],
    drive: [],
    comms: [],
    hist: []
  }
};

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
 * Switch the active preview tab.
 * @param {string} tabKey
 */
function switchTab(tabKey) {
  previewState.activeTab = tabKey;
  renderTabs();
  renderView();
}

/**
 * Render the content for the currently active tab.
 * Each tab defaults to an empty state.
 */
function renderView() {
  const viewEl = document.querySelector('#view');
  if (!viewEl) return;

  const currentTab = previewState.activeTab;
  const items = previewState.data[currentTab] || [];

  if (items.length === 0) {
    let emptyMsg = 'No records found.';
    switch (currentTab) {
      case 'cal':
        emptyMsg = 'No events scheduled.';
        break;
      case 'rem':
        emptyMsg = 'No active reminders.';
        break;
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

  // Future real data rendering placeholder
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

window.preview = {
  renderTabs,
  switchTab,
  renderView,
  setTabData,
  getActiveTab: () => previewState.activeTab
};
