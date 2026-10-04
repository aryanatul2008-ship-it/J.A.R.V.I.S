/**
 * queue.js - Command queue state and visual queue bar management
 */

const queueState = {
  queue: [],
  running: null,
  mode: 'queue' // 'queue' | 'interrupt'
};

/**
 * Render the queue bar element.
 */
function renderQueue() {
  const qs = document.querySelector('#qs');
  const modeBtn = document.querySelector('#mode');
  if (!qs || !modeBtn) return;

  let html = '';
  if (queueState.running) {
    html += `<span class="q running">${window.esc ? window.esc(queueState.running.text) : queueState.running.text}</span>`;
  }

  queueState.queue.forEach(item => {
    html += `<span class="q">${window.esc ? window.esc(item.text) : item.text}</span>`;
  });

  qs.innerHTML = html || '<span style="color:var(--dim)">empty</span>';
  modeBtn.textContent = 'NEW COMMAND: ' + (queueState.mode === 'queue' ? 'QUEUE IT' : 'INTERRUPT');
}

/**
 * Toggle execution mode between queuing new commands or interrupting running ones.
 */
function toggleMode() {
  queueState.mode = queueState.mode === 'queue' ? 'interrupt' : 'queue';
  renderQueue();
  if (window.chat && window.chat.showToast) {
    window.chat.showToast(`New commands will ${queueState.mode === 'queue' ? 'join the queue' : 'interrupt running operations'}`);
  }
}

/**
 * Add a command string to the queue.
 * @param {string} text
 */
function enqueue(text) {
  queueState.queue.push({ text, state: 'queued' });
  renderQueue();
}

/**
 * Clear the queue and running state.
 */
function clearQueue() {
  queueState.queue = [];
  queueState.running = null;
  renderQueue();
}

window.queue = {
  state: queueState,
  renderQueue,
  toggleMode,
  enqueue,
  clearQueue
};
