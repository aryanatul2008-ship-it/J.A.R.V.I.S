/**
 * queue.js - Command queue state, concurrency control, and execution queue bar
 */

const queueState = {
  queue: [], // array of string command texts
  running: null, // { text: string, controller: AbortController } | null
  mode: 'queue' // 'queue' | 'interrupt'
};

/**
 * Render the queue status bar in the console header/footer.
 */
function renderQueue() {
  const qs = document.querySelector('#qs');
  const modeBtn = document.querySelector('#mode');
  if (!qs) return;

  let html = '';
  if (queueState.running) {
    html += `<span class="q running" title="${window.esc ? window.esc(queueState.running.text) : queueState.running.text}">${window.esc ? window.esc(queueState.running.text) : queueState.running.text}</span>`;
  }

  queueState.queue.forEach((itemText) => {
    html += `<span class="q" title="${window.esc ? window.esc(itemText) : itemText}">${window.esc ? window.esc(itemText) : itemText}</span>`;
  });

  qs.innerHTML = html || '<span style="color:var(--dim)">empty</span>';

  if (modeBtn) {
    modeBtn.textContent = 'NEW COMMAND: ' + (queueState.mode === 'queue' ? 'QUEUE IT' : 'INTERRUPT');
  }
}

/**
 * Toggle execution mode between queuing new commands or interrupting running operations.
 */
function toggleMode() {
  queueState.mode = queueState.mode === 'queue' ? 'interrupt' : 'queue';
  renderQueue();
  if (window.chat && window.chat.showToast) {
    window.chat.showToast(`New commands will ${queueState.mode === 'queue' ? 'join the queue' : 'interrupt running operations'}`);
  }
}

/**
 * Submit a command from user input or quick chip.
 * Depending on mode and current state, executes immediately, enqueues, or interrupts.
 * @param {string} raw
 */
function submit(raw) {
  const text = (raw || '').trim();
  if (!text) return;

  // Clear input field without blocking or disabling it
  const inputEl = document.querySelector('#in');
  if (inputEl) {
    inputEl.value = '';
  }

  if (queueState.running) {
    if (queueState.mode === 'interrupt') {
      // INTERRUPT mode: abort current running command and start new one immediately
      const activeRunning = queueState.running;
      if (activeRunning && activeRunning.controller) {
        activeRunning.controller.abort();
      }

      if (window.chat && window.chat.addMessage) {
        window.chat.addMessage('j', '<span style="color: var(--dim); font-size: 12px;">Previous operation cancelled</span>');
      }

      runCommand(text);
    } else {
      // QUEUE mode: append to queue
      queueState.queue.push(text);
      renderQueue();
      if (window.chat && window.chat.showToast) {
        window.chat.showToast(`Command queued (${queueState.queue.length} in queue)`);
      }
    }
  } else {
    // Idle state: run immediately
    runCommand(text);
  }
}

/**
 * Execute a single command via chat SSE streaming and manage queue advancement.
 * @param {string} text
 */
async function runCommand(text) {
  const controller = new AbortController();
  queueState.running = { text, controller };
  renderQueue();

  if (window.chat && window.chat.setStatus) {
    window.chat.setStatus('processing');
  }

  try {
    if (window.chat && window.chat.streamCommand) {
      await window.chat.streamCommand(text, controller.signal);
    }
  } catch (err) {
    console.warn('[QUEUE] Error during command streaming:', err.message);
  } finally {
    // Only release running slot if this specific controller is still the active one
    // (Prevents an interrupted command from prematurely resetting a newer running command)
    if (queueState.running && queueState.running.controller === controller) {
      queueState.running = null;
    }

    renderQueue();

    // Automatically process next item in queue if available
    if (queueState.queue.length > 0 && !queueState.running) {
      const nextCommand = queueState.queue.shift();
      runCommand(nextCommand);
    } else if (!queueState.running) {
      if (window.chat && window.chat.setStatus) {
        window.chat.setStatus('online');
      }
    }

    // Refresh live integration states and action history after each command
    if (window.refreshStatus) {
      window.refreshStatus();
    }
    if (window.refreshHistory && window.preview && window.preview.getActiveTab() === 'hist') {
      window.refreshHistory();
    }
  }
}

/**
 * Append to queue (helper).
 * @param {string} text
 */
function enqueue(text) {
  queueState.queue.push(text);
  renderQueue();
}

/**
 * Clear queue and running state.
 */
function clearQueue() {
  queueState.queue = [];
  if (queueState.running && queueState.running.controller) {
    queueState.running.controller.abort();
  }
  queueState.running = null;
  renderQueue();
}

window.queue = {
  state: queueState,
  renderQueue,
  toggleMode,
  submit,
  runCommand,
  enqueue,
  clearQueue
};
window.submitCommand = submit;
