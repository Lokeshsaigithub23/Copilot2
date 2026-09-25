const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { convertVideoToAudio } = require('../services/video-processor.service');
const { isS3Enabled, uploadFile, deleteFile, deleteLocalFile } = require('../services/storage.service');

// ─────────────────────────────────────────
// In-memory Job Store (for active/processing jobs)
// ─────────────────────────────────────────

// jobId → { status, userId, videoPath, videoUrl, audioPath, audioUrl, audioFileName, error, listeners[], createdAt, s3VideoKey, s3AudioKey }
const jobs = new Map();

// Clean up jobs older than 1 hour to prevent memory leaks
const JOB_TTL_MS = 60 * 60 * 1000;
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

// ─────────────────────────────────────────
// Persistent JSON History (per-user, like upload routes)
// ─────────────────────────────────────────

const historyFilePath = path.join(__dirname, '../../data/video_history.json');

function readHistory() {
  try {
    if (!fs.existsSync(historyFilePath)) {
      const dir = path.dirname(historyFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(historyFilePath, '[]');
      return [];
    }
    const data = fs.readFileSync(historyFilePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (e) {
    console.error('[Video History] Read error:', e);
    return [];
  }
}

function writeHistory(history) {
  try {
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
  } catch (e) {
    console.error('[Video History] Write error:', e);
  }
}

/**
 * Notify all active SSE listeners for a given job.
 */
function notifyListeners(jobId, event, data) {
  const job = jobs.get(jobId);
  if (!job || !job.listeners) return;

  for (const res of job.listeners) {
    try {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    } catch (_) {}
  }

  // Close connections on terminal events
  if (event === 'completed' || event === 'error') {
    for (const res of job.listeners) {
      try {
        if (!res.writableEnded) res.end();
      } catch (_) {}
    }
    job.listeners = [];
  }
}

// ─────────────────────────────────────────
// Route Factory
// ─────────────────────────────────────────

function createVideoRoutes(authenticateToken) {
  const router = express.Router();

  // Directory paths
  const videoDir = path.join(__dirname, '../../uploads/meta/video');
  const audioDir = path.join(__dirname, '../../uploads/meta/audio');

  // Ensure directories exist
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  // Configure multer for video uploads (always saves locally first — needed for FFmpeg)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
    const allowedMimes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
      'video/webm', 'video/x-flv', 'video/x-ms-wmv', 'application/octet-stream'
    ];

    if (allowedExts.includes(ext) || allowedMimes.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type (${ext || mime}). Supported formats: MP4, MOV, AVI, MKV, WebM, FLV, WMV.`));
    }
  };

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB
    fileFilter
  });

  // ─────────────────────────────────────────
  // POST /api/video/upload
  // ─────────────────────────────────────────

  router.post('/upload', authenticateToken, (req, res) => {
    upload.any()(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'File is too large. Maximum allowed size is 10 GB.' });
        }
        return res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ ok: false, error: err.message || 'File upload failed.' });
      }

      const file = req.file || (req.files && req.files[0]);
      if (!file) {
        return res.status(400).json({ ok: false, error: 'No video file uploaded. Send file under field "file" or "video".' });
      }

      const userId = req.user?.id || req.user?.userId;
      const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const videoPath = file.path;
      const localVideoUrl = `/uploads/meta/video/${file.filename}`;

      // Register job in memory
      jobs.set(jobId, {
        status: 'processing',
        userId,
        videoPath,
        videoUrl: localVideoUrl,
        videoFileName: file.originalname,
        videoFileSize: file.size,
        audioPath: null,
        audioUrl: null,
        audioFileName: null,
        error: null,
        listeners: [],
        createdAt: Date.now(),
        s3VideoKey: null,
        s3AudioKey: null
      });

      console.log(`[video-upload] Video saved: ${file.originalname} (${file.size} bytes). JobId: ${jobId}. S3: ${isS3Enabled()}`);

      // Send immediate response with jobId
      res.json({
        ok: true,
        message: 'Video uploaded successfully. Audio conversion started in background.',
        jobId,
        video: {
          fileName: file.originalname,
          fileSize: file.size,
          url: localVideoUrl
        }
      });

      // ── Background conversion ──
      // This runs AFTER the response has been sent to the client.
      setImmediate(async () => {
        const job = jobs.get(jobId);
        try {
          // Notify any SSE listeners that processing has started
          notifyListeners(jobId, 'processing', {
            jobId,
            message: 'Video to audio conversion in progress...'
          });

          // Step 1: If S3 enabled, upload video to S3 first
          let s3VideoKey = null;
          if (isS3Enabled()) {
            s3VideoKey = `videos/${userId}/${file.filename}`;
            await uploadFile(videoPath, s3VideoKey, localVideoUrl);
            if (job) job.s3VideoKey = s3VideoKey;
            console.log(`[video-upload] Video uploaded to S3: ${s3VideoKey}`);
          }

          // Step 2: Convert video to audio (always uses local file — FFmpeg needs disk access)
          const { audioPath, audioFileName } = await convertVideoToAudio(videoPath, audioDir);
          const localAudioUrl = `/uploads/meta/audio/${audioFileName}`;

          // Step 3: If S3 enabled, upload audio to S3
          let finalAudioUrl = localAudioUrl;
          let s3AudioKey = null;
          if (isS3Enabled()) {
            s3AudioKey = `audio/${userId}/${audioFileName}`;
            const { url } = await uploadFile(audioPath, s3AudioKey, localAudioUrl);
            finalAudioUrl = url;
            console.log(`[video-upload] Audio uploaded to S3: ${s3AudioKey}`);
          }

          // Step 4: Delete the original video (from S3 + local)
          if (isS3Enabled() && s3VideoKey) {
            await deleteFile(null, s3VideoKey); // delete from S3
          }
          deleteLocalFile(videoPath); // always delete local video
          console.log(`[video-upload] Original video deleted for job ${jobId}`);

          // Step 5: If S3 enabled, delete local audio too (it's on S3 now)
          if (isS3Enabled()) {
            deleteLocalFile(audioPath);
          }

          // Update job status in memory
          if (job) {
            job.status = 'completed';
            job.audioPath = isS3Enabled() ? null : audioPath;
            job.audioUrl = finalAudioUrl;
            job.audioFileName = audioFileName;
            job.s3AudioKey = s3AudioKey;
            job.videoPath = null; // video is deleted
          }

          console.log(`[video-upload] Conversion complete for job ${jobId}: ${audioFileName}`);

          // Step 6: Persist to video_history.json
          const history = readHistory();
          history.push({
            id: jobId,
            userId,
            videoFileName: file.originalname,
            videoFileSize: file.size,
            audioFileName,
            audioUrl: finalAudioUrl,
            s3AudioKey,
            storageMode: isS3Enabled() ? 's3' : 'local',
            createdAt: new Date().toISOString()
          });
          writeHistory(history);

          // Notify all SSE listeners
          notifyListeners(jobId, 'completed', {
            jobId,
            audioUrl: finalAudioUrl,
            audioFileName
          });
        } catch (conversionErr) {
          console.error(`[video-upload] Conversion failed for job ${jobId}:`, conversionErr.message);

          // On failure, DON'T delete the video (user might want to retry)
          if (job) {
            job.status = 'error';
            job.error = conversionErr.message;
          }

          // Notify all SSE listeners
          notifyListeners(jobId, 'error', {
            jobId,
            message: conversionErr.message
          });
        }
      });
    });
  });

  // ─────────────────────────────────────────
  // GET /api/video/sessions — List all video sessions for the authenticated user
  // ─────────────────────────────────────────

  router.get('/sessions', authenticateToken, (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return res.json({ ok: true, sessions: [] });

      const history = readHistory();
      const userSessions = history
        .filter(s => s.userId === userId)
        .map(s => ({
          id: s.id,
          videoFileName: s.videoFileName,
          videoFileSize: s.videoFileSize,
          audioFileName: s.audioFileName,
          audioUrl: s.audioUrl,
          storageMode: s.storageMode,
          createdAt: s.createdAt
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json({ ok: true, sessions: userSessions });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────
  // GET /api/video/session/:id — Get details of a specific session
  // ─────────────────────────────────────────

  router.get('/session/:id', authenticateToken, (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const { id } = req.params;

      const history = readHistory();
      const session = history.find(s => s.id === id && s.userId === userId);

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Session not found.' });
      }

      res.json({ ok: true, session });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────
  // DELETE /api/video/session/:id — Delete a session and its audio file
  // ─────────────────────────────────────────

  router.delete('/session/:id', authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const { id } = req.params;

      let history = readHistory();
      const session = history.find(s => s.id === id && s.userId === userId);

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Session not found.' });
      }

      // Delete audio file (from S3 or local)
      if (session.storageMode === 's3' && session.s3AudioKey) {
        try { await deleteFile(null, session.s3AudioKey); } catch (_) {}
      } else if (session.audioFileName) {
        const localAudioPath = path.join(audioDir, session.audioFileName);
        deleteLocalFile(localAudioPath);
      }

      // Remove from history
      history = history.filter(s => s.id !== id);
      writeHistory(history);

      // Also remove from in-memory jobs if present
      jobs.delete(id);

      res.json({ ok: true, message: 'Session deleted successfully.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────
  // GET /api/video/status/:jobId  (SSE + Polling)
  // ─────────────────────────────────────────

  router.get('/status/:jobId', authenticateToken, (req, res) => {
    const { jobId } = req.params;
    const userId = req.user?.id || req.user?.userId;
    const job = jobs.get(jobId);

    if (!job) {
      // Check persistent history in case job expired from memory
      const history = readHistory();
      const session = history.find(s => s.id === jobId && s.userId === userId);
      if (session) {
        return res.json({
          ok: true,
          status: 'completed',
          jobId,
          audioUrl: session.audioUrl,
          audioFileName: session.audioFileName
        });
      }
      return res.status(404).json({ ok: false, error: 'Job not found.' });
    }

    // Ensure user can only access their own jobs
    if (job.userId !== userId) {
      return res.status(404).json({ ok: false, error: 'Job not found.' });
    }

    // If job is already done, return result directly
    if (job.status === 'completed') {
      return res.json({
        ok: true,
        status: 'completed',
        jobId,
        audioUrl: job.audioUrl,
        audioFileName: job.audioFileName
      });
    }

    if (job.status === 'error') {
      return res.json({
        ok: true,
        status: 'error',
        jobId,
        message: job.error
      });
    }

    // If client requested polling (Accept: application/json or ?poll=true), return JSON
    const isPolling = req.query.poll === 'true' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/event-stream'));
    if (isPolling) {
      return res.json({
        ok: true,
        status: 'processing',
        jobId,
        message: 'Video to audio conversion in progress...'
      });
    }

    // Job is still processing — open SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial processing event
    res.write(`event: processing\ndata: ${JSON.stringify({ jobId, message: 'Video to audio conversion in progress...' })}\n\n`);

    // Register this response as a listener
    job.listeners.push(res);

    // Clean up when client disconnects
    req.on('close', () => {
      const currentJob = jobs.get(jobId);
      if (currentJob) {
        currentJob.listeners = currentJob.listeners.filter(l => l !== res);
      }
    });
  });

  return router;
}

module.exports = { createVideoRoutes };
