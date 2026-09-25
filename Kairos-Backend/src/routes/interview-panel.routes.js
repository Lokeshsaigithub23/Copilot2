const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractTextFromFile, analyzeResumeText } = require('../services/resume-parser.service');

function createInterviewPanelRoutes(authenticateToken) {
  const router = express.Router();
  const uploadDirectory = path.join(__dirname, '../../uploads/interview-panel-resumes');

  const storage = multer.diskStorage({
    destination: (req, file, callback) => {
      fs.mkdirSync(uploadDirectory, { recursive: true });
      callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `resume-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      if (['.pdf', '.docx', '.doc'].includes(extension)) {
        return callback(null, true);
      }
      return callback(new Error('Invalid file type. Please upload a PDF, DOCX, or DOC document.'));
    }
  });

  const savedAudioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }
  });

  router.post('/transcribe-saved-audio', authenticateToken, savedAudioUpload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'systemAudio', maxCount: 1 },
    { name: 'candidateAudio', maxCount: 1 }
  ]), async (req, res) => {
    const mixedFile = req.files?.file?.[0];
    const systemFile = req.files?.systemAudio?.[0];
    const candidateFile = req.files?.candidateAudio?.[0];
    if (!mixedFile?.buffer?.length && !systemFile?.buffer?.length && !candidateFile?.buffer?.length) {
      return res.status(400).json({ ok: false, error: 'No saved audio file received.' });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'Audio transcription is temporarily unavailable.' });
    }

    try {
      const selectedLanguage = typeof req.body?.language === 'string' && req.body.language.trim() ? req.body.language.trim() : 'en';
      const transcribeTrack = async (file, speaker) => {
        if (!file?.buffer?.length) return { transcript: '', utterances: [] };
        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        deepgramUrl.searchParams.set('model', 'nova-2');
        deepgramUrl.searchParams.set('smart_format', 'true');
        deepgramUrl.searchParams.set('punctuate', 'true');
        deepgramUrl.searchParams.set('utterances', 'true');
        deepgramUrl.searchParams.set('paragraphs', 'true');
        deepgramUrl.searchParams.set('language', selectedLanguage);

        const response = await fetch(deepgramUrl, {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': file.mimetype || 'audio/webm'
          },
          body: file.buffer
        });

        if (!response.ok) {
          throw new Error(`Deepgram returned ${response.status}`);
        }

        const payload = await response.json();
        const rawUtterances = payload?.results?.utterances || [];
        const utterances = rawUtterances.map((item, index) => {
          const start = Number(item.start) || 0;
          const startSeconds = Math.floor(start);
          const minutes = Math.floor(startSeconds / 60);
          const seconds = startSeconds % 60;
          return {
            id: `${speaker}-${index + 1}`,
            speaker,
            timecode: `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`,
            start,
            end: Number(item.end) || 0,
            text: item.transcript || ''
          };
        });
        return {
          transcript: payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '',
          utterances
        };
      };

      // Separate tracks preserve speaker identity. Keep mixed-file diarization
      // only for older clients that do not send the new track fields.
      const trackResults = await Promise.all([
        transcribeTrack(systemFile, 'interviewer'),
        transcribeTrack(candidateFile, 'candidate')
      ]);
      let transcript = trackResults.map(result => result.transcript).filter(Boolean).join(' ');
      let utterances = trackResults.flatMap(result => result.utterances).sort((a, b) => a.start - b.start);

      if (utterances.length === 0 && mixedFile?.buffer?.length) {
        const mixedResult = await transcribeTrack(mixedFile, 'interviewer');
        transcript = mixedResult.transcript;
        utterances = mixedResult.utterances;
      }

      return res.json({ ok: true, transcript, utterances });
    } catch (error) {
      console.error('[Saved Audio Transcription] failed:', error.message);
      return res.status(502).json({ ok: false, error: 'Saved audio transcription failed.' });
    }
  });

  router.post('/upload-resume', authenticateToken, (req, res) => {
    upload.single('file')(req, res, async (uploadError) => {
      if (uploadError instanceof multer.MulterError) {
        const message = uploadError.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum allowed size is 15MB.'
          : `Upload error: ${uploadError.message}`;
        return res.status(400).json({ ok: false, error: message });
      }
      if (uploadError) {
        return res.status(400).json({ ok: false, error: uploadError.message || 'File upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No resume file uploaded.' });
      }

      try {
        const resumeText = await extractTextFromFile(req.file.path, req.file.originalname);
        const analysis = analyzeResumeText(resumeText, req.file.originalname);
        return res.json({
          ok: true,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          resumeText,
          preview: {
            name: analysis.name,
            role: analysis.role,
            skills: analysis.skills,
            summary: analysis.summary,
            sections: analysis.sections,
            greeting: analysis.greeting,
            suggestedQuestions: analysis.suggestedQuestions
          }
        });
      } catch (error) {
        return res.status(400).json({
          ok: false,
          error: error.message || 'The uploaded document does not appear to be a resume.'
        });
      } finally {
        try {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (_) {}
      }
    });
  });

  return router;
}

module.exports = { createInterviewPanelRoutes };