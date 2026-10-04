/**
 * test-frontend-chat-queue.js
 * Comprehensive automated test suite for chat.js and queue.js logic
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simple DOM environment simulation
class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = '';
    this.classList = {
      add: (cls) => {
        const set = new Set(this.className.split(' ').filter(Boolean));
        set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (cls) => {
        const set = new Set(this.className.split(' ').filter(Boolean));
        set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls) => this.className.split(' ').includes(cls)
    };
    this.children = [];
    this._innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.dataset = {};
    this.parentElement = null;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.textContent = val.replace(/<[^>]+>/g, '');
    this.children = [];

    const tagRegex = /<([a-z0-9]+)([^>]*)>/gi;
    let match;
    while ((match = tagRegex.exec(val)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      const el = new MockElement(tag);

      const idMatch = attrs.match(/id="([^"]+)"/);
      if (idMatch) el.id = idMatch[1];

      const classMatch = attrs.match(/class="([^"]+)"/);
      if (classMatch) el.className = classMatch[1];

      const confirmMatch = attrs.match(/data-confirm-action="([^"]+)"/);
      if (confirmMatch) el.dataset.confirmAction = confirmMatch[1];

      const cancelMatch = attrs.match(/data-cancel-action="([^"]+)"/);
      if (cancelMatch) el.dataset.cancelAction = cancelMatch[1];

      el.parentElement = this;
      this.children.push(el);
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      if (selector.startsWith('#') && node.id === selector.slice(1)) {
        results.push(node);
      } else if (selector.startsWith('.') && node.classList && node.classList.contains(selector.slice(1))) {
        results.push(node);
      } else if (selector.includes('data-confirm-action') && node.dataset && node.dataset.confirmAction) {
        results.push(node);
      } else if (selector.includes('data-cancel-action') && node.dataset && node.dataset.cancelAction) {
        results.push(node);
      } else if (selector.toLowerCase() === node.tagName.toLowerCase()) {
        results.push(node);
      }
      for (const child of node.children) {
        check(child);
      }
    };
    check(this);
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (selector.includes('data-confirm-action') && curr.dataset && curr.dataset.confirmAction) {
        return curr;
      }
      if (selector.includes('data-cancel-action') && curr.dataset && curr.dataset.cancelAction) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }
}

// Mock DOM elements
const elements = {
  '#log': new MockElement('div', 'log'),
  '#qs': new MockElement('span', 'qs'),
  '#mode': new MockElement('button', 'mode'),
  '#in': new MockElement('input', 'in'),
  '#cnt': new MockElement('span', 'cnt'),
  '#st': new MockElement('div', 'st'),
  '#stt': new MockElement('span', 'stt'),
  '#toast': new MockElement('div', 'toast')
};

const docListeners = {};

global.document = {
  querySelector: (sel) => {
    if (elements[sel]) return elements[sel];
    for (const el of Object.values(elements)) {
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    let res = [];
    for (const el of Object.values(elements)) {
      res = res.concat(el.querySelectorAll(sel));
    }
    return res;
  },
  createElement: (tag) => new MockElement(tag),
  addEventListener: (event, handler) => {
    if (!docListeners[event]) docListeners[event] = [];
    docListeners[event].push(handler);
  }
};

global.window = {
  document: global.document,
  chat: {},
  queue: {},
  preview: {
    switchedTabs: [],
    refreshedCalendars: [],
    refreshedReminders: [],
    refreshedComms: [],
    driveSearches: [],
    switchTab(tab) { this.switchedTabs.push(tab); },
    refreshCalendar(id) { this.refreshedCalendars.push(id); },
    refreshReminders(id) { this.refreshedReminders.push(id); },
    refreshComms(id) { this.refreshedComms.push(id); },
    showDriveSearchResults(q, files) { this.driveSearches.push({ q, files }); }
  },
  upload: {
    dialogsOpened: [],
    openUploadDialog(folder) { this.dialogsOpened.push(folder); }
  },
  api: {
    confirmedActions: [],
    cancelledActions: [],
    async post(url) {
      if (url.includes('/confirm')) this.confirmedActions.push(url);
      if (url.includes('/cancel')) this.cancelledActions.push(url);
      return { ok: true };
    }
  },
  dispatchEvent(evt) {}
};

// Load chat.js and queue.js into context
const chatCode = fs.readFileSync(path.join(__dirname, '../public/js/chat.js'), 'utf8');
const queueCode = fs.readFileSync(path.join(__dirname, '../public/js/queue.js'), 'utf8');

eval(chatCode);
eval(queueCode);

async function runTests() {
  console.log('--- STARTING FRONTEND CHAT & QUEUE TEST SUITE ---');

  // Test 1: Chat step event rendering
  console.log('\n[TEST 1] Testing step event rendering...');
  const stepRunningEvt = {
    type: 'step',
    id: 'step_1',
    tool: 'create_calendar_event',
    status: 'running',
    summary: 'Creating calendar event: Stark team meeting'
  };
  window.chat.handleEvent(stepRunningEvt, 'test command');
  const stepEl = document.querySelector('#step-step_1');
  assert(stepEl, 'Step element #step-step_1 should exist');
  assert(stepEl.className.includes('running'), 'Step element should have running class');
  assert(stepEl.innerHTML.includes('▶ Creating calendar event'), 'Step element should display spinner & text');
  console.log('✓ Step running rendered with spinner');

  // Test 2: Step done event
  console.log('\n[TEST 2] Testing step done event & preview synchronization...');
  const stepDoneEvt = {
    type: 'step',
    id: 'step_1',
    tool: 'create_calendar_event',
    status: 'done',
    summary: 'Creating calendar event: Stark team meeting',
    result: { id: 'evt_123', title: 'Stark team meeting' }
  };
  window.chat.handleEvent(stepDoneEvt, 'test command');
  assert(stepEl.className.includes('done'), 'Step element should have done class');
  assert(stepEl.innerHTML.includes('✓'), 'Step element should display check mark');
  assert(stepEl.innerHTML.includes('Created calendar event: Stark team meeting'), 'Step element should have formatted result summary');
  assert.strictEqual(window.chat.getActionCount(), 1, 'Action counter should increment');
  assert(window.preview.switchedTabs.includes('cal'), 'Should switch to cal tab');
  assert(window.preview.refreshedCalendars.includes('evt_123'), 'Should refresh calendar with new event ID');
  console.log('✓ Step done turned into check mark and synced preview');

  // Test 3: Action confirmation card (Telegram staging)
  console.log('\n[TEST 3] Testing Telegram action confirmation card...');
  const stepConfirmEvt = {
    type: 'step',
    id: 'step_2',
    tool: 'send_telegram_message',
    status: 'done',
    summary: 'Staging Telegram message for Bruce',
    result: {
      status: 'awaiting_user_confirmation',
      actionId: 42,
      recipient: 'Bruce Banner',
      message: 'Meeting at 6 PM'
    }
  };
  window.chat.handleEvent(stepConfirmEvt, 'test command');
  const actionCard = document.querySelector('#action-card-42');
  assert(actionCard, 'Action card #action-card-42 should exist');
  const msgEl = actionCard.parentElement;
  assert(msgEl.innerHTML.includes('Bruce Banner'), 'Action card should show recipient');
  assert(msgEl.innerHTML.includes('Meeting at 6 PM'), 'Action card should show message');

  // Test clicking Send
  const confirmBtn = msgEl.querySelector('button[data-confirm-action="42"]');
  assert(confirmBtn, 'Confirm button should exist');
  const clickHandler = docListeners['click'][0];
  await clickHandler({ target: confirmBtn });
  assert(window.api.confirmedActions.some(u => u.includes('/actions/42/confirm')), 'API post should confirm action 42');
  assert(window.preview.switchedTabs.includes('comms'), 'Preview should switch to comms tab');
  console.log('✓ Telegram confirmation card rendered and confirmed');

  // Test 4: Queue vs Interrupt Mode
  console.log('\n[TEST 4] Testing Queue and Interrupt execution modes...');
  
  // Set mode to QUEUE
  window.queue.state.mode = 'queue';
  let commandRunResolve = null;
  let commandRunCount = 0;
  let executedCommands = [];

  // Override streamCommand to control timing
  window.chat.streamCommand = async (text, signal) => {
    commandRunCount++;
    executedCommands.push(text);
    return new Promise((resolve) => {
      commandRunResolve = resolve;
      signal.addEventListener('abort', () => {
        resolve(false);
      });
    });
  };

  // Submit first command: runs immediately
  window.queue.submit('Command 1');
  assert(window.queue.state.running, 'Command 1 should be running');
  assert.strictEqual(window.queue.state.running.text, 'Command 1');
  assert.strictEqual(window.queue.state.queue.length, 0);

  // Submit second command while first is running: should be enqueued
  window.queue.submit('Command 2');
  assert.strictEqual(window.queue.state.queue.length, 1, 'Command 2 should be in queue');
  assert.strictEqual(window.queue.state.queue[0], 'Command 2');
  console.log('✓ In QUEUE mode, new command joined the queue while first was running');

  // Finish Command 1: Command 2 should automatically start
  const prevResolve = commandRunResolve;
  prevResolve(true);
  await new Promise(r => setTimeout(r, 10)); // allow queue advancement
  assert(window.queue.state.running, 'Command 2 should now be running');
  assert.strictEqual(window.queue.state.running.text, 'Command 2');
  assert.strictEqual(window.queue.state.queue.length, 0, 'Queue should now be empty');
  console.log('✓ When Command 1 finished, Command 2 automatically executed');

  // Switch to INTERRUPT mode
  window.queue.toggleMode();
  assert.strictEqual(window.queue.state.mode, 'interrupt', 'Mode should be interrupt');

  // Submit Command 3 while Command 2 is running in INTERRUPT mode
  const cmd2Controller = window.queue.state.running.controller;
  window.queue.submit('Command 3');
  assert(cmd2Controller.signal.aborted, 'Command 2 controller should be aborted');
  assert(window.queue.state.running, 'Command 3 should now be running');
  assert.strictEqual(window.queue.state.running.text, 'Command 3');
  console.log('✓ In INTERRUPT mode, running command was aborted and new command started immediately');

  // Finish Command 3
  commandRunResolve(true);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(window.queue.state.running, null, 'Running state should be cleared when queue empties');

  console.log('\n--- ALL FRONTEND CHAT & QUEUE TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
