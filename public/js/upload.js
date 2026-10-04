/**
 * upload.js - File upload controller with drag-and-drop, destination selection, and XMLHttpRequest progress
 */

const uploadState = {
  selectedFile: null,
  isUploading: false
};

/**
 * Fetch non-trashed folders from the server and populate the destination select dropdown.
 */
async function loadDestinationFolders() {
  const select = document.querySelector('#drive-folder-select');
  if (!select) return;

  try {
    const res = await window.api.get('/api/drive/folders');
    const folders = (res && res.folders) || [];

    // Reset options starting with root and new folder action
    let optionsHtml = '<option value="root">My Drive</option>';
    folders.forEach((f) => {
      optionsHtml += `<option value="${window.esc(f.id)}">${window.esc(f.name)}</option>`;
    });
    optionsHtml += '<option value="__new__">+ Create new folder…</option>';

    select.innerHTML = optionsHtml;
  } catch (err) {
    console.warn('[UPLOAD] Could not load destination folders:', err.message);
  }
}

/**
 * Handle file upload with XMLHttpRequest to provide real-time progress events.
 */
function uploadCurrentFile() {
  if (uploadState.isUploading) return;

  const fileInput = document.querySelector('#drive-file-input');
  const file = uploadState.selectedFile || (fileInput && fileInput.files[0]);

  if (!file) {
    setUploadStatus('Please select a file to upload.', 'error');
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    setUploadStatus('File exceeds the 50 MB demo limit.', 'error');
    return;
  }

  const folderSelect = document.querySelector('#drive-folder-select');
  const newFolderInput = document.querySelector('#drive-new-folder-input');

  const selectedFolderVal = folderSelect ? folderSelect.value : 'root';
  let folderId = selectedFolderVal === '__new__' ? null : selectedFolderVal;
  let newFolderName = selectedFolderVal === '__new__' && newFolderInput ? newFolderInput.value.trim() : null;

  if (selectedFolderVal === '__new__' && !newFolderName) {
    setUploadStatus('Please enter a name for the new folder.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  if (newFolderName) {
    formData.append('newFolderName', newFolderName);
  } else if (folderId && folderId !== 'root') {
    formData.append('folderId', folderId);
  }

  uploadState.isUploading = true;
  setUploadProgress(0);
  setUploadStatus(`Uploading <b>${window.esc(file.name)}</b>…`, 'info');

  const progressBar = document.querySelector('#drive-upload-progress');
  if (progressBar) progressBar.style.display = 'block';

  const xhr = new XMLHttpRequest();

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      setUploadProgress(percent);
    }
  };

  xhr.onload = () => {
    uploadState.isUploading = false;
    if (xhr.status >= 200 && xhr.status < 300) {
      setUploadProgress(100);
      let targetName = 'My Drive';
      try {
        const data = JSON.parse(xhr.responseText);
        targetName = (data.file && data.file.parentName) || targetName;
      } catch (_) {}

      setUploadStatus(`Upload complete! <b>${window.esc(file.name)}</b> saved in <b>${window.esc(targetName)}</b>.`, 'success');
      resetUploadInputs();

      // Refresh Drive explorer and destination folders
      if (window.refreshDrive) {
        window.refreshDrive();
      }
      loadDestinationFolders();
    } else {
      let errMsg = 'Upload failed';
      try {
        const errData = JSON.parse(xhr.responseText);
        errMsg = errData.message || errData.error || errMsg;
      } catch (_) {}
      setUploadStatus(`⚠ ${errMsg}`, 'error');
      if (progressBar) progressBar.style.display = 'none';
    }
  };

  xhr.onerror = () => {
    uploadState.isUploading = false;
    setUploadStatus('⚠ Network error encountered during upload.', 'error');
    if (progressBar) progressBar.style.display = 'none';
  };

  xhr.open('POST', '/api/drive/upload', true);
  xhr.send(formData);
}

function setUploadProgress(percent) {
  const bar = document.querySelector('#drive-upload-progress i');
  if (bar) {
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

function setUploadStatus(html, type) {
  const statusEl = document.querySelector('#drive-upload-status');
  if (!statusEl) return;

  statusEl.innerHTML = html;
  statusEl.className = `upload-status ${type}`;
  statusEl.style.display = 'block';
}

function resetUploadInputs() {
  uploadState.selectedFile = null;
  const fileInput = document.querySelector('#drive-file-input');
  if (fileInput) fileInput.value = '';

  const label = document.querySelector('#drive-selected-file-label');
  if (label) label.textContent = 'No file chosen';

  const newFolderInput = document.querySelector('#drive-new-folder-input');
  if (newFolderInput) newFolderInput.value = '';
}

/**
 * Open or configure upload controls with optional pre-selected folder name.
 * @param {string} [preselectedFolderName]
 */
function openUploadDialog(preselectedFolderName = null) {
  if (window.preview && window.preview.switchTab) {
    window.preview.switchTab('drive');
  }

  const uploadBox = document.querySelector('#drive-upload-box');
  if (uploadBox) {
    uploadBox.scrollIntoView({ behavior: 'smooth' });
  }

  if (preselectedFolderName) {
    const select = document.querySelector('#drive-folder-select');
    const newWrap = document.querySelector('#drive-new-folder-wrap');
    const newNameInput = document.querySelector('#drive-new-folder-input');

    if (select) {
      // Check if folder option already exists in dropdown
      let matched = false;
      for (const opt of select.options) {
        if (opt.text.toLowerCase() === preselectedFolderName.toLowerCase()) {
          select.value = opt.value;
          matched = true;
          break;
        }
      }

      if (!matched) {
        select.value = '__new__';
        if (newWrap) newWrap.style.display = 'block';
        if (newNameInput) newNameInput.value = preselectedFolderName;
      }
    }
  }
}

// Bind upload DOM interactions
document.addEventListener('DOMContentLoaded', () => {
  // Folder selector change event
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'drive-folder-select') {
      const wrap = document.querySelector('#drive-new-folder-wrap');
      if (wrap) {
        wrap.style.display = e.target.value === '__new__' ? 'block' : 'none';
      }
    }

    if (e.target && e.target.id === 'drive-file-input') {
      const file = e.target.files[0];
      uploadState.selectedFile = file || null;
      const label = document.querySelector('#drive-selected-file-label');
      if (label) {
        label.textContent = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'No file chosen';
      }
    }
  });

  // Upload trigger button
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'drive-upload-btn') {
      uploadCurrentFile();
    }
  });
});

window.openUploadDialog = openUploadDialog;
window.upload = {
  loadDestinationFolders,
  uploadCurrentFile,
  openUploadDialog
};
