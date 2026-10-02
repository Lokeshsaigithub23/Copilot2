//src/controllers/session.controller.js

const fs = require('fs');
const multer = require('multer');
const path = require('path');
const usageService = require('../services/usage.service');

function resolvePrivateFilePath(uploadRoot, storedPath) {
  const resolvedRoot = path.resolve(uploadRoot);
  const resolvedPath = path.resolve(__dirname, '../../', storedPath || '');
  return resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) ? resolvedPath : null;
}

function createSessionController({ db, config }) {
  const storage = multer.diskStorage({
    destination: (_, __, callback) => callback(null, config.uploadDirectory),
    filename: (req, file, callback) => callback(null, `${req.params.id}_audio_${Date.now()}${path.extname(file.originalname) || '.webm'}`)
  });
  const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

  return {
    upload,
    create: async (req, res) => {
      try {
        if (!req.body) {
          return res.status(400).json({
            error: {
              message: 'Session data is required.'
            }
          });
        }

        const userId = req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Unauthorized.'
            }
          });
        }

        const durationSeconds = Math.max(
          0,
          Math.ceil(Number(req.body.durationSeconds) || 0)
        );

        // /api/sessions is the Copilot / InterviewPanel session endpoint.
        // Do not charge anything for a zero-duration session.
        if (durationSeconds > 0) {
          const access = await usageService.checkFeatureAccess(
            userId,
            'copilot',
            durationSeconds
          );

          if (!access.allowed) {
            return res.status(403).json({
              error: {
                code: 'COPILOT_USAGE_LIMIT_EXCEEDED',
                message: 'Your Copilot usage limit has been reached.',
                tier: access.tier,
                limitSeconds: access.limitSeconds,
                usedSeconds: access.usedSeconds,
                remainingSeconds: access.remainingSeconds,
                requestedSeconds: durationSeconds
              }
            });
          }
        }

        const session = await db.createSession(req.body, userId);

        // Record the actual session duration after the session is saved.
        if (durationSeconds > 0) {
          await usageService.recordUsage(
            userId,
            'copilot',
            durationSeconds
          );
        }

        res.status(201).json({
          ok: true,
          message: 'Session created successfully.',
          session: {
            id: session.id,
            title: session.title
          }
        });
      } catch (err) {
        console.error('Create session error:', err.message);

        res.status(500).json({
          error: {
            message: 'Failed to save interview session metadata.'
          }
        });
      }
    },
    uploadAudio: async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: { message: 'Audio file is missing.' } });
        const relativePath = `uploads/${req.file.filename}`;
        await db.updateSessionAudio(req.params.id, relativePath, req.user.userId);
        console.log(`[Audio Upload] Saved audio for session ${req.params.id}`);
        res.json({ ok: true, message: 'Audio recording uploaded successfully.', audioUrl: `${config.publicApiBaseUrl}/api/sessions/${encodeURIComponent(req.params.id)}/audio` });
      } catch (err) {
        console.error('Audio upload error:', err.message);
        if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        // A session the caller does not own is reported the same as one that
        // does not exist, so session ids cannot be probed for existence.
        if (err.message === 'Session not found') {
          return res.status(404).json({ error: { message: 'Session not found.' } });
        }
        res.status(500).json({ error: { message: 'Failed to upload session audio.' } });
      }
    },
    getAudio: async (req, res) => {
      try {
        const session = await db.getSessionByUser(req.params.id, req.user.userId);
        if (!session?.audioFilePath) return res.status(404).json({ error: { message: 'Audio recording not found.' } });

        const uploadRoot = path.resolve(config.uploadDirectory);
        const filePath = resolvePrivateFilePath(uploadRoot, session.audioFilePath);
        if (!filePath || !fs.existsSync(filePath)) {
          return res.status(404).json({ error: { message: 'Audio recording not found.' } });
        }

        return res.sendFile(filePath);
      } catch (err) {
        console.error('Audio retrieval error:', err.message);
        return res.status(404).json({ error: { message: 'Audio recording not found.' } });
      }
    },
    list: async (req, res) => {
      try { res.json({ sessions: await db.getSessionsByUser(req.user.userId) }); }
      catch (err) { console.error('Retrieve sessions error:', err.message); res.status(500).json({ error: { message: 'Failed to retrieve past interview sessions.' } }); }
    },
    delete: async (req, res) => {
      try {
        const deleted = await db.deleteSession(req.params.id, req.user.userId);
        if (!deleted) return res.status(404).json({ error: { message: 'Session not found.' } });
        res.json({ ok: true, message: 'Session deleted successfully.' });
      } catch (err) {
        console.error('Delete session error:', err.message);
        res.status(500).json({ error: { message: 'Failed to delete session.' } });
      }
    }
  };
}

module.exports = { createSessionController, resolvePrivateFilePath };
