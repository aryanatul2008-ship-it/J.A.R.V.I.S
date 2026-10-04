/**
 * chat.js - Console log, toast, and status indicator management
 */

function esc(s) {
  return String(s).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/**
 * Update the JARVIS status indicator.
 * @param {'online' | 'processing' | 'offline'} state
 */
function setStatus(state) {
  const st = document.querySelector('#st');
  const stt = document.querySelector('#stt');
  if (!st || !stt) return;

  st.classList.remove('busy', 'offline');

  if (state === 'processing') {
    st.classList.add('busy');
    stt.textContent = 'JARVIS PROCESSING';
  } else if (state === 'offline') {
    st.classList.add('offline');
    stt.textContent = 'JARVIS OFFLINE';
  } else {
    // Default: 'online'
    stt.textContent = 'JARVIS ONLINE';
  }
}

/**
 * Append a formatted message to the console log.
 * @param {'u' | 'j' | 'e'} type - 'u' for user, 'j' for jarvis, 'e' for error
 * @param {string} html - HTML message content
 */
function addMessage(type, html) {
  const log = document.querySelector('#log');
  if (!log) return null;

  const d = document.createElement('div');
  d.className = 'm ' + type;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

/**
 * Display a temporary floating toast message.
 * @param {string} text
 */
function showToast(text) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('on');
  setTimeout(() => {
    t.classList.remove('on');
  }, 1800);
}

/**
 * Update the action counter badge in the console header.
 * @param {number} count
 */
function updateActionCount(count) {
  const cnt = document.querySelector('#cnt');
  if (cnt) {
    cnt.textContent = `${count} ACTION${count === 1 ? '' : 'S'}`;
  }
}

window.esc = esc;
window.setStatus = setStatus;
window.chat = {
  esc,
  setStatus,
  addMessage,
  showToast,
  updateActionCount
};
