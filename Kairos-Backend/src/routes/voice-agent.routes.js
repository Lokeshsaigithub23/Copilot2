const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractTextFromFile, analyzeResumeText } = require('../services/resume-parser.service');

function createVoiceAgentRoutes(authenticateToken) {
  const router = express.Router();

  // Configure multer storage for resumes
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../../uploads/resumes');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const fileFilter = (req, file, cb) => {
    const original = (file.originalname || '').trim();
    const lastDot = original.lastIndexOf('.');
    const ext = lastDot !== -1 ? original.substring(lastDot).toLowerCase() : '';
    const mime = (file.mimetype || '').toLowerCase();
    const allowedExts = ['.pdf', '.docx', '.doc'];
    const allowedMimes = [
      'application/pdf',
      'application/x-pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ];
    if (allowedExts.includes(ext) || allowedMimes.includes(mime)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type (${ext || mime || 'unknown'}). Please upload a PDF, DOCX, or DOC document.`));
    }
  };

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter
  });

  /**
   * POST /api/voice-agent/upload-resume
   * Upload and analyze candidate resume for live Voice Agent interview
   */
  router.post('/upload-resume', authenticateToken, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'File is too large. Maximum allowed size is 15MB.' });
        }
        return res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ ok: false, error: err.message || 'File upload failed.' });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No resume file uploaded.' });
      }

      const filePath = req.file.path;
      try {
        const resumeText = await extractTextFromFile(filePath, req.file.originalname);
        const analysis = analyzeResumeText(resumeText, req.file.originalname);

        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}

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
      } catch (parseErr) {
        console.error('[VoiceAgent Resume Upload] Parsing failed:', parseErr.message);
        // Clean up file on parse failure
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        return res.status(400).json({
          ok: false,
          error: 'The uploaded document could not be processed. Please upload a valid resume.'
        });
      }
    });
  });

  return router;
}

module.exports = { createVoiceAgentRoutes };
