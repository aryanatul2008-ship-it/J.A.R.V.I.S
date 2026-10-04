/**
 * drive.js - Google Drive file search, browsing, folder management, and upload service
 */

const { google } = require('googleapis');
const { Readable } = require('stream');
const googleService = require('./google');

/**
 * Normalize and map Google API errors to standard system error codes.
 * @param {Error} err
 */
function handleGoogleError(err) {
  if (err.code === 'validation') {
    throw err;
  }

  const status = err.status || err.statusCode || (err.response && err.response.status);
  const errMsg = (err.message || '').toLowerCase();

  if (status === 401 || errMsg.includes('invalid_grant') || errMsg.includes('auth_expired')) {
    const authErr = new Error('Google authorization expired. Please reconnect.');
    authErr.code = 'auth_expired';
    authErr.status = 401;
    throw authErr;
  }

  if (status === 403 || errMsg.includes('permission denied')) {
    const permErr = new Error(err.message || 'Access to Google Drive was denied.');
    permErr.code = 'permission_denied';
    permErr.status = 403;
    throw permErr;
  }

  if (status >= 500 || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code)) {
    const unavailErr = new Error('Google Drive service is temporarily unavailable.');
    unavailErr.code = 'integration_unavailable';
    unavailErr.status = 503;
    throw unavailErr;
  }

  throw err;
}

/**
 * List files and folders inside a specific folder for browsing.
 * @param {number} userId
 * @param {object} [options]
 * @param {string} [options.folderId='root']
 */
async function listFolder(userId, { folderId = 'root' } = {}) {
  try {
    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Determine current folder metadata for breadcrumb display
    let folderMeta = { id: folderId, name: 'My Drive', parentId: null };
    if (folderId !== 'root') {
      try {
        const folderGet = await drive.files.get({
          fileId: folderId,
          fields: 'id, name, parents'
        });
        folderMeta = {
          id: folderGet.data.id,
          name: folderGet.data.name,
          parentId: (folderGet.data.parents && folderGet.data.parents[0]) || 'root'
        };
      } catch (err) {
        console.warn(`[DRIVE] Could not get metadata for folder ${folderId}:`, err.message);
      }
    }

    const q = `'${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size, parents)',
      orderBy: 'folder, name',
      pageSize: 100
    });

    const files = (res.data.files || []).map((f) => {
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink || '',
        size: f.size ? parseInt(f.size, 10) : null
      };
    });

    return {
      folder: folderMeta,
      files
    };
  } catch (err) {
    handleGoogleError(err);
  }
}

/**
 * Search files by name and full-text content.
 * Resolves parent folder names with per-request caching.
 * @param {number} userId
 * @param {object} params
 * @param {string} params.query
 */
async function searchFiles(userId, { query } = {}) {
  try {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim();
    // Escape single quotes and backslashes in search query
    const escaped = cleanQuery.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `(name contains '${escaped}' or fullText contains '${escaped}') and trashed = false`;

    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size, parents)',
      pageSize: 20,
      orderBy: 'folder, name'
    });

    const rawFiles = res.data.files || [];
    const parentCache = new Map();
    parentCache.set('root', 'My Drive');

    const files = [];
    for (const f of rawFiles) {
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      let parentName = 'My Drive';
      const parentId = f.parents && f.parents[0];

      if (parentId) {
        if (parentCache.has(parentId)) {
          parentName = parentCache.get(parentId);
        } else {
          try {
            const parentRes = await drive.files.get({
              fileId: parentId,
              fields: 'name'
            });
            parentName = parentRes.data.name || 'Folder';
            parentCache.set(parentId, parentName);
          } catch (_) {
            parentName = 'Folder';
            parentCache.set(parentId, parentName);
          }
        }
      }

      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink || '',
        size: f.size ? parseInt(f.size, 10) : null,
        folderName: parentName
      });
    }

    return files;
  } catch (err) {
    handleGoogleError(err);
  }
}

/**
 * List all non-trashed folders for the destination dropdown.
 * @param {number} userId
 */
async function listFolders(userId) {
  try {
    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      pageSize: 100,
      orderBy: 'name'
    });

    return (res.data.files || []).map((f) => ({
      id: f.id,
      name: f.name
    }));
  } catch (err) {
    handleGoogleError(err);
  }
}

/**
 * Return ID of an existing folder with exact name, or create it.
 * @param {number} userId
 * @param {string} name
 */
async function ensureFolder(userId, name) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    const err = new Error('Folder name is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  try {
    const cleanName = name.trim();
    const escaped = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const existing = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escaped}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1
    });

    if (existing.data.files && existing.data.files.length > 0) {
      return existing.data.files[0].id;
    }

    const created = await drive.files.create({
      requestBody: {
        name: cleanName,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id, name'
    });

    return created.data.id;
  } catch (err) {
    handleGoogleError(err);
  }
}

/**
 * Upload a file buffer into Google Drive.
 * @param {number} userId
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.filename
 * @param {string} [params.mimeType]
 * @param {string} [params.folderId='root']
 */
async function uploadFile(userId, { buffer, filename, mimeType, folderId }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    const err = new Error('File buffer is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  if (!filename || typeof filename !== 'string' || !filename.trim()) {
    const err = new Error('Filename is required');
    err.code = 'validation';
    err.status = 400;
    throw err;
  }

  try {
    const authClient = await googleService.getAuthedClient(userId);
    const drive = google.drive({ version: 'v3', auth: authClient });

    const targetFolderId = folderId || 'root';
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      requestBody: {
        name: filename.trim(),
        parents: [targetFolderId]
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: stream
      },
      fields: 'id, name, mimeType, modifiedTime, webViewLink, parents'
    });

    let parentName = 'My Drive';
    if (targetFolderId !== 'root') {
      try {
        const parentGet = await drive.files.get({
          fileId: targetFolderId,
          fields: 'name'
        });
        parentName = parentGet.data.name || 'Folder';
      } catch (_) {}
    }

    return {
      id: res.data.id,
      name: res.data.name,
      mimeType: res.data.mimeType,
      parentName,
      modifiedTime: res.data.modifiedTime,
      webViewLink: res.data.webViewLink || ''
    };
  } catch (err) {
    handleGoogleError(err);
  }
}

module.exports = {
  listFolder,
  searchFiles,
  listFolders,
  ensureFolder,
  uploadFile
};
