const express = require('express');

function createAiRoutes(controller, authenticateToken) {
  const router = express.Router();
  router.use(authenticateToken);

  router.post('/deepgram/transcribe', controller.transcribe);
  // Both /copilot/answer and /copilot-answer supported for consistency across callers
  router.post('/copilot/answer', controller.copilotAnswer);
  router.post('/copilot-answer', controller.copilotAnswer);
  router.post('/notetaker/generate-notes', controller.notes);
  router.post('/notetaker/chat-reply', controller.chat);
  router.post('/translate-text', controller.translate);
  router.post('/get-translation-tts', controller.translationTts);

  return router;
}

module.exports = { createAiRoutes };
