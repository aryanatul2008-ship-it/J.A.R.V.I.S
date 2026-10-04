/**
 * drive.js - Google Drive API routes for browsing, searching, and uploading files
 */

const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const driveService = require('../services/drive');

const router = express.Router();

// Memory storage with 50 MB max file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

/**
 * GET /api/drive/list?folderId=
 * Returns files and folders for browsing, plus breadcrumbs metadata.
 */
router.get('/api/drive/list', requireAuth, async (req, res, next) => {
  try {
    const folderId = req.query.folderId || 'root';
    const data = await driveService.listFolder(req.session.userId, { folderId });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/drive/search?q=
 * Searches drive files by name and full-text content.
 */
router.get('/api/drive/search', requireAuth, async (req, res, next) => {
  try {
    const query = req.query.q || '';
    const files = await driveService.searchFiles(req.session.userId, { query });
    res.json({ files });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/drive/folders
 * Returns list of non-trashed folders for destination selection.
 */
router.get('/api/drive/folders', requireAuth, async (req, res, next) => {
  try {
    const folders = await driveService.listFolders(req.session.userId);
    res.json({ folders });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/drive/upload
 * Handles file uploads into selected or newly created folders.
 */
router.post('/api/drive/upload', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          code: 'file_too_large',
          message: 'File exceeds the 50 MB demo limit.'
        });
      }
      return res.status(400).json({
        error: 'Upload failed',
        code: 'upload_error',
        message: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided',
        code: 'missing_file',
        message: 'Please choose a document to upload.'
      });
    }

    try {
      let targetFolderId = 'root';
      const { folderId, newFolderName } = req.body;

      if (newFolderName && newFolderName.trim()) {
        targetFolderId = await driveService.ensureFolder(req.session.userId, newFolderName.trim());
      } else if (folderId && folderId.trim()) {
        targetFolderId = folderId.trim();
      }

      const uploaded = await driveService.uploadFile(req.session.userId, {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        folderId: targetFolderId
      });

      res.status(201).json({ file: uploaded });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

module.exports = router;
