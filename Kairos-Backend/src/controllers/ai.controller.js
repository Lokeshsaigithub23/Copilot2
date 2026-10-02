const { transcribeAudioWithDeepgram } = require('../services/audio.service');
const usageService = require('../services/usage.service');

function createAiController({ aiService, prisma }) {
  async function transcribe(req, res) {
    try {
      if (!req.body.audioUrl) return res.status(400).json({ error: { message: 'Audio URL is required for transcription.' } });
      res.json({ transcription: await transcribeAudioWithDeepgram(req.body.audioUrl) });
    } catch (err) { console.error('Deepgram transcription error:', err.message); res.status(500).json({ error: { message: 'Failed to transcribe audio using Deepgram.' } }); }
  }

  async function copilotAnswer(req, res) {
    const text = req.body.text || req.body.question;

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: {
          message: 'text or question is required.'
        }
      });
    }

    const question = text.trim();
    const forceQuestion = req.body.forceQuestion === true;
    const history = Array.isArray(req.body.history) ? req.body.history : [];
    const resumeContext =
      typeof req.body.resumeContext === 'string'
        ? req.body.resumeContext
        : '';

    const language =
      typeof req.body.language === 'string' &&
      req.body.language.trim()
        ? req.body.language.trim()
        : 'en';

    if (!forceQuestion) {
      let isQ = aiService.isInterviewQuestion(
        question,
        false,
        language
      );

      if (
        !isQ &&
        language !== 'en' &&
        typeof aiService.classifyInterviewQuestion === 'function'
      ) {
        isQ = await aiService.classifyInterviewQuestion(
          question,
          language
        );
      }

      if (!isQ) {
        return res.json({ isQuestion: false });
      }
    }

    // Get authenticated user
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication is required.',
        },
      });
    }

    // Check Copilot usage BEFORE starting SSE
    const copilotAccess = await usageService.checkFeatureAccess(
      userId,
      'copilot',
      1
    );

    if (!copilotAccess.allowed) {
      return res.status(403).json({
        error: {
          code: 'COPILOT_USAGE_LIMIT_EXCEEDED',
          message:
            'Your Copilot usage limit has been reached. Please upgrade your plan to continue.',
        },
        tier: copilotAccess.tier,
        limitSeconds: copilotAccess.limitSeconds,
        usedSeconds: copilotAccess.usedSeconds,
        remainingSeconds: copilotAccess.remainingSeconds,
      });
    }

    // Start SSE response only after validation succeeds
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event, data) =>
      res.write(
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      );

    send('ai-answer-start', { question });

    let completed = 0;

    if (userId) {
      try {
        await prisma.auditEvent.create({
          data: {
            actorId: userId,
            action: 'COPILOT_ANSWER_REQUESTED',
            metadata: JSON.stringify({
              source: 'copilot',
              language
            })
          }
        });
      } catch (error) {
        console.error(
          '[referral] Failed to record Copilot request:',
          error
        );
      }
    }

    const finish = (panel) => {
      send('ai-answer-done', { panel });

      if (++completed === 2) {
        res.end();
      }
    };

    const fail = (message) => {
      send('ai-error', { message });

      if (++completed === 2) {
        res.end();
      }
    };

    for (const panel of ['a', 'b']) {
      aiService.generateAnswerStreaming(
        question,
        panel,
        (answer) =>
          send('ai-answer', {
            question,
            answer,
            panel,
            isStreaming: true
          }),
        finish,
        fail,
        history,
        resumeContext,
        language
      );
    }
  }

  async function notes(req, res) { try { res.json({ ok: true, notes: await aiService.generateNotes(req.body.transcript, req.body.spokenLanguage, req.body.targetLanguage) }); } catch (err) { console.error('[notetaker-notes] error:', err.message); res.status(500).json({ ok: false, error: 'Unable to generate notes.' }); } }
  async function chat(req, res) { try { res.json({ ok: true, reply: await aiService.generateNotetakerChatReply(req.body.message, req.body.history) }); } catch (err) { console.error('[notetaker-chat] error:', err.message); res.status(500).json({ ok: false, error: 'Unable to generate a response.' }); } }
  async function translate(req, res) { try { res.json({ ok: true, translatedText: await aiService.translateText(req.body.text, req.body.from, req.body.to, req.body.engine) }); } catch (err) { console.error('[translate-text] error:', err.message); res.json({ ok: false, translatedText: req.body?.text || '' }); } }
  async function translationTts(req, res) {
    try {
      if (!req.body.text) return res.json({ base64Audio: '' });
      const code = aiService.getLanguageCode(req.body.langCode || 'en');
      const chunks = [];
      let current = '';
      for (const word of req.body.text.split(/\s+/)) { if ((current + ' ' + word).length > 150) { if (current) chunks.push(current); current = word; } else current = current ? `${current} ${word}` : word; }
      if (current) chunks.push(current);
      const buffers = [];
      for (const chunk of chunks) {
        const response = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&tl=${code}&client=tw-ob&q=${encodeURIComponent(chunk)}`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' } });
        if (!response.ok) throw new Error(`Google TTS HTTP ${response.status}`);
        buffers.push(Buffer.from(await response.arrayBuffer()));
      }
      res.json({ ok: true, base64Audio: Buffer.concat(buffers).toString('base64') });
    } catch (err) { console.error('[get-translation-tts] error:', err.message); res.status(500).json({ ok: false, error: 'Unable to generate audio.' }); }
  }

  return { transcribe, copilotAnswer, notes, chat, translate, translationTts };
}
module.exports = { createAiController };
