const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

function createUploadRoutes(authenticateToken) {
  const router = express.Router();
  const uploadDirectory = path.resolve(path.join(__dirname, '../../uploads'));
  
  // Configure multer storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB limit
    fileFilter: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '').toLowerCase();
      if (mime.startsWith('audio/') || mime.startsWith('video/') || ['.mp3', '.wav', '.webm', '.m4a', '.mp4', '.mpeg', '.mpga', '.ogg', '.oga'].includes(extension)) {
        return callback(null, true);
      }
      return callback(new Error('This page accepts audio or video files. Upload resumes from the AI Copilot page.'));
    }
  });
  
  // Helpers to manage JSON history file
  const historyFilePath = path.join(__dirname, '../../data/uploads_history.json');
  
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
      console.error('[Upload History] Read error:', e);
      return [];
    }
  }
  
  function writeHistory(history) {
    try {
      fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
    } catch (e) {
      console.error('[Upload History] Write error:', e);
    }
  }

  // Files are private resources. Resolve only server-recorded paths belonging
  // to the authenticated user, and never accept a client-provided filesystem path.
  router.get('/file/:filename', authenticateToken, (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const filename = path.basename(req.params.filename || '');
      const session = readHistory().find((item) => {
        return item.userId === userId && path.basename(item.filePath || '') === filename;
      });

      if (!session) return res.status(404).json({ ok: false, error: 'File not found.' });

      const filePath = path.resolve(session.filePath);
      if (!filePath.startsWith(`${uploadDirectory}${path.sep}`) || !fs.existsSync(filePath)) {
        return res.status(404).json({ ok: false, error: 'File not found.' });
      }

      return res.sendFile(filePath);
    } catch (err) {
      console.error('[Upload File] Failed to serve private file:', err.message);
      return res.status(404).json({ ok: false, error: 'File not found.' });
    }
  });

  function cleanAiOutput(text) {
    if (!text || typeof text !== 'string') return text || '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/###\s*/g, '')
      .replace(/##\s*/g, '')
      .replace(/#\s*/g, '')
      .replace(/\*\*/g, '')
      .trim();
  }

  function buildUploadFileUrl(filename) {
    return `/api/upload/file/${encodeURIComponent(filename)}`;
  }

  async function transcribeFile(filePath, mimetype, language = 'en') {
    const dgKey = process.env.DEEPGRAM_API_KEY;
    if (!dgKey) throw new Error('DEEPGRAM_API_KEY is not set on the server.');

    const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
    deepgramUrl.searchParams.set('model', 'nova-2');
    deepgramUrl.searchParams.set('smart_format', 'true');
    deepgramUrl.searchParams.set('punctuate', 'true');
    deepgramUrl.searchParams.set('diarize', 'true');
    deepgramUrl.searchParams.set('utterances', 'true');
    deepgramUrl.searchParams.set('language', language);
    deepgramUrl.searchParams.set('paragraphs', 'true');

    const response = await fetch(deepgramUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${dgKey}`,
        'Content-Type': mimetype || 'application/octet-stream'
      },
      body: fs.readFileSync(filePath)
    });

    if (!response.ok) throw new Error(`Deepgram transcription failed: ${response.statusText}`);
    const payload = await response.json();
    const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    if (!transcript.trim()) throw new Error('Transcribed text is empty. Make sure the file has audible speech.');

    const rawUtterances = payload?.results?.utterances || [];
    const utterances = rawUtterances.map((utterance, index) => {
      const start = Number(utterance.start) || 0;
      const startSec = Math.floor(start);
      const mins = Math.floor(startSec / 60);
      const secs = startSec % 60;
      return {
        id: index + 1,
        speaker: `Speaker ${(utterance.speaker ?? 0) + 1}`,
        timecode: `${mins}:${secs < 10 ? '0' : ''}${secs}`,
        start,
        end: Number(utterance.end) || 0,
        text: utterance.transcript || ''
      };
    });

    const durationSeconds = Number(payload?.metadata?.duration)
      || Number(rawUtterances.at(-1)?.end)
      || 0;
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);

    return {
      transcript,
      utterances,
      durationSeconds,
      duration: durationSeconds ? `${minutes}:${seconds < 10 ? '0' : ''}${seconds}` : '0:30',
      speakersCount: new Set(utterances.map((utterance) => utterance.speaker)).size || 1
    };
  }

  // Store the file first. Transcription is started explicitly by the client.
  router.post('/upload-file', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded.' });

    const userId = req.user?.id || req.user?.userId;
    const fileUrl = buildUploadFileUrl(req.file.filename);
    const session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileUrl,
      fileSize: req.file.size,
      duration: '0:30',
      durationSeconds: 0,
      speakersCount: 1,
      transcript: '',
      utterances: [],
      translations: {},
      createdAt: new Date().toISOString(),
      title: req.file.originalname.length > 30 ? `${req.file.originalname.slice(0, 30)}...` : req.file.originalname,
      messages: [{
        sender: 'ai',
        text: 'Audio uploaded and ready to transcribe.',
        audioUrl: fileUrl
      }]
    };

    const history = readHistory();
    history.push(session);
    writeHistory(history);
    return res.json({ ok: true, session });
  });

  // Transcribe a previously uploaded file owned by the authenticated user.
  router.post('/transcribe', authenticateToken, async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    const sessionId = String(req.body?.sessionId || '');
    const history = readHistory();
    const session = history.find((item) => item.id === sessionId && item.userId === userId);
    if (!session) return res.status(404).json({ ok: false, error: 'Session not found.' });
    if (!session.filePath || !fs.existsSync(session.filePath)) {
      return res.status(404).json({ ok: false, error: 'Uploaded file not found.' });
    }

    try {
      const result = await transcribeFile(session.filePath, session.mimeType, req.body?.language || 'en');
      Object.assign(session, result);
      session.isTranscribing = false;
      const sessionIndex = history.findIndex((item) => item.id === session.id);
      history[sessionIndex] = session;
      writeHistory(history);
      return res.json({ ok: true, session });
    } catch (err) {
      console.error('[Upload Transcribe Error]:', err.message);
      return res.status(500).json({ ok: false, error: 'Unable to transcribe the uploaded file.' });
    }
  });

  // Endpoint: Get list of upload sessions for the authenticated user
  router.get('/sessions', authenticateToken, (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return res.json({ ok: true, sessions: [] });
      const history = readHistory();
      const userSessions = history
        .filter(s => s.userId === userId && s.fileName && s.fileName !== 'General Chat')
        .map(s => ({
          id: s.id,
          fileName: s.fileName,
          title: s.title,
          duration: s.duration || '0:30',
          createdAt: s.createdAt
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ ok: true, sessions: userSessions });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Unable to load upload sessions.' });
    }
  });

  // Endpoint: Get details of a specific session
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
      res.status(500).json({ ok: false, error: 'Unable to load the requested session.' });
    }
  });

  // Endpoint: Delete a session
  router.delete('/session/:id', authenticateToken, (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const { id } = req.params;
      let history = readHistory();
      const session = history.find(s => s.id === id && s.userId === userId);
      if (!session) {
        return res.status(404).json({ ok: false, error: 'Session not found.' });
      }
      // Delete local upload file if exists
      if (session.filePath && fs.existsSync(session.filePath)) {
        try { fs.unlinkSync(session.filePath); } catch (_) {}
      }
      history = history.filter(s => s.id !== id);
      writeHistory(history);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Unable to delete the requested session.' });
    }
  });

  // Endpoint: Analyze uploaded file
  router.post('/analyze', authenticateToken, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded.' });
    }
    
    const userId = req.user?.id || req.user?.userId;
    const filePath = file.path;
    const mimetype = file.mimetype;
    const fileName = file.originalname;

    try {
      // 1. Transcribe audio/video using Deepgram
      const dgKey = process.env.DEEPGRAM_API_KEY;
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY is not set on the server.');

      console.log(`[Upload] Transcribing ${fileName} (${file.size} bytes)...`);
      const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
      deepgramUrl.searchParams.set('model', 'nova-2');
      deepgramUrl.searchParams.set('smart_format', 'true');
      deepgramUrl.searchParams.set('punctuate', 'true');
      deepgramUrl.searchParams.set('diarize', 'true');
      deepgramUrl.searchParams.set('utterances', 'true');
      deepgramUrl.searchParams.set('language', req.body.language || 'en');
      deepgramUrl.searchParams.set('paragraphs', 'true');
      const fileBuffer = fs.readFileSync(filePath);
      const dgResponse = await fetch(deepgramUrl, {
        method: 'POST',
        headers: {
          Authorization: `Token ${dgKey}`,
          'Content-Type': mimetype || 'application/octet-stream'
        },
        body: fileBuffer
      });

      if (!dgResponse.ok) {
        throw new Error(`Deepgram transcription failed: ${dgResponse.statusText}`);
      }

      const dgPayload = await dgResponse.json();
      const transcript = dgPayload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      if (!transcript.trim()) {
        throw new Error('Transcribed text is empty. Make sure the file has audible speech.');
      }

      // Parse Deepgram utterances for speaker diarization turns
      const rawUtterances = dgPayload?.results?.utterances || [];
      const utterances = rawUtterances.map((u, idx) => {
        const startSec = Math.floor(u.start || 0);
        const mins = Math.floor(startSec / 60);
        const secs = startSec % 60;
        const timecode = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        const speakerNum = (u.speaker !== undefined ? u.speaker + 1 : 1);
        return {
          id: idx + 1,
          speaker: `Speaker ${speakerNum}`,
          timecode,
          start: u.start || 0,
          end: u.end || 0,
          text: u.transcript || ''
        };
      });

      const uniqueSpeakers = new Set(utterances.map(u => u.speaker)).size || 1;

      // Calculate accurate media duration from Deepgram metadata or last utterance end
      const durationSeconds = dgPayload?.metadata?.duration || (rawUtterances.length > 0 ? rawUtterances[rawUtterances.length - 1].end : 0) || 0;
      const durMins = Math.floor(durationSeconds / 60);
      const durSecs = Math.floor(durationSeconds % 60);
      const formattedDuration = durationSeconds > 0 ? `${durMins}:${durSecs < 10 ? '0' : ''}${durSecs}` : '0:30';

      // 2. Query Grok (xAI) for the summary or question answer
      const grokKey = process.env.GROK_UPLOAD_API_KEY || process.env.GROQ_API_KEY;
      if (!grokKey) throw new Error('Grok API key is not set on the server.');
      
      const question = req.body.question || '';
      console.log(`[Upload] Generating Grok response for transcript. Question present: ${!!question}`);
      const grokClient = new OpenAI({
        apiKey: grokKey,
        baseURL: 'https://api.x.ai/v1'
      });

      let systemPrompt = '';
      let userPrompt = '';
      let userMsgText = '';

      if (question) {
        systemPrompt = `You are a helpful assistant. You will be given the transcript of an audio or video file. Your job is to answer the user's question clearly and accurately based on the transcript context.
CRITICAL FORMATTING RULES:
- Do NOT use markdown symbols like asterisks (**) or hashes (###). Never output double asterisks around headings.
- Present text cleanly in plain layout with clear headings and line breaks.`;
        userPrompt = `Here is the transcript of the uploaded file:\n\n${transcript}\n\nUser's question:\n${question}`;
        userMsgText = question;
      } else {
        systemPrompt = `You are a helpful assistant. You will be given the transcript of an audio or video file. Your job is to analyze the transcript and provide a clear, comprehensive description and summary of what is discussed in the file.
CRITICAL FORMATTING RULES:
- Do NOT use markdown symbols like asterisks (**) or hashes (###). Never output double asterisks around headings.
- For section headings, write the heading plainly followed by a colon (for example: Summary of the Audio File: or Overall Context:), without any asterisks.
- Present text cleanly in plain layout with clean line breaks.`;
        userPrompt = `Here is the transcript of the uploaded file:\n\n${transcript}\n\nPlease summarize and explain what is inside this file.`;
        userMsgText = '';
      }

      const response = await grokClient.chat.completions.create({
        model: 'grok-4.20-0309-non-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5
      });

      const rawReplyContent = response.choices?.[0]?.message?.content?.trim() || 'No response generated.';
      const replyContent = cleanAiOutput(rawReplyContent);

      // 3. Save session to history
      const sessionId = 'session-' + Date.now();
      const sessionData = {
        id: sessionId,
        userId,
        fileName,
        filePath,
        fileUrl: `/api/upload/file/${encodeURIComponent(file.filename)}`,
        fileSize: file.size,
        duration: formattedDuration,
        durationSeconds,
        speakersCount: uniqueSpeakers,
        transcript,
        utterances,
        translations: {},
        createdAt: new Date().toISOString(),
        title: fileName.length > 30 ? fileName.slice(0, 30) + '...' : fileName,
        messages: [
          { sender: 'user', text: userMsgText, attachedFile: { name: fileName, url: `/api/upload/file/${encodeURIComponent(file.filename)}` } },
          { sender: 'ai', text: replyContent, audioUrl: `/api/upload/file/${encodeURIComponent(file.filename)}` }
        ]
      };

      const history = readHistory();
      history.push(sessionData);
      writeHistory(history);

      res.json({ ok: true, session: sessionData });
    } catch (err) {
      console.error('[Upload Analyze Error]:', err.message);
      // Clean up uploaded file on failure
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
      res.status(500).json({ ok: false, error: 'Unable to analyze the uploaded file.' });
    }
  });

  // Endpoint: Translate transcript and utterances into target language
  router.post('/translate', authenticateToken, async (req, res) => {
    const { sessionId, targetLanguage, targetLangName, transcript, utterances } = req.body;
    if (!targetLanguage && !targetLangName) {
      return res.status(400).json({ ok: false, error: 'targetLanguage is required.' });
    }

    const langName = targetLangName || targetLanguage;

    try {
      const grokKey = process.env.GROK_UPLOAD_API_KEY || process.env.GROQ_API_KEY;
      if (!grokKey) throw new Error('Grok API key is not configured.');

      const grokClient = new OpenAI({
        apiKey: grokKey,
        baseURL: 'https://api.x.ai/v1'
      });

      const userId = req.user?.id || req.user?.userId;
      const history = readHistory();
      let session = null;
      if (sessionId) {
        session = history.find(s => s.id === sessionId && s.userId === userId);
      }

      // If cached translation already exists, return it immediately
      if (session?.translations && session.translations[langName]) {
        return res.json({
          ok: true,
          cached: true,
          targetLanguage: langName,
          ...session.translations[langName]
        });
      }

      const textToTranslate = transcript || session?.transcript || '';
      let turnsToTranslate = (utterances && utterances.length > 0) ? utterances : (session?.utterances || []);

      if (!textToTranslate.trim() && turnsToTranslate.length === 0) {
        return res.status(400).json({ ok: false, error: 'No transcript available to translate.' });
      }

      // If turns are empty but text is present, synthesize turns for diarized translation
      if (turnsToTranslate.length === 0 && textToTranslate.trim()) {
        const sentences = textToTranslate.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
        let timeOffset = 1;
        turnsToTranslate = sentences.map((s, idx) => {
          const mins = Math.floor(timeOffset / 60);
          const secs = timeOffset % 60;
          const turnObj = {
            speaker: 'Speaker 1',
            timecode: `${mins}:${secs < 10 ? '0' : ''}${secs}`,
            start: timeOffset,
            end: timeOffset + 3,
            text: s.trim()
          };
          timeOffset += Math.max(3, Math.min(8, Math.round(s.split(' ').length * 0.4)));
          return turnObj;
        });
      }

      console.log(`[Upload Translate] Translating session ${sessionId || 'custom'} to ${langName}...`);

      const systemPrompt = `You are an expert multilingual translator. Translate the provided spoken transcript turns into ${langName}.
Preserve speaker labels and timestamps exactly.
Translate the text accurately and fluently into ${langName}.
Respond with a strict JSON object with this format:
{
  "translatedText": "full translated text in ${langName}",
  "translatedUtterances": [
    { "speaker": "Speaker 1", "timecode": "0:01", "start": 0.01, "end": 1.25, "text": "translated speech line in ${langName}" }
  ]
}
Do NOT include any markdown code blocks, backticks or commentary. Only return the valid JSON string.`;

      let userContent = '';
      if (turnsToTranslate.length > 0) {
        userContent = JSON.stringify({
          transcript: textToTranslate,
          utterances: turnsToTranslate.map(u => ({
            speaker: u.speaker,
            timecode: u.timecode,
            start: u.start,
            end: u.end,
            text: u.text
          }))
        });
      } else {
        userContent = JSON.stringify({ transcript: textToTranslate });
      }

      const response = await grokClient.chat.completions.create({
        model: 'grok-4.20-0309-non-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3
      });

      let rawReply = response.choices?.[0]?.message?.content?.trim() || '{}';
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      if (jsonMatch) rawReply = jsonMatch[0];

      let parsedResult;
      try {
        parsedResult = JSON.parse(rawReply);
      } catch (jsonErr) {
        parsedResult = {
          translatedText: rawReply,
          translatedUtterances: turnsToTranslate.map(u => ({ ...u, text: rawReply }))
        };
      }

      const translationData = {
        translatedText: parsedResult.translatedText || '',
        translatedUtterances: parsedResult.translatedUtterances || []
      };

      // Cache translation in session history
      if (session) {
        session.translations = session.translations || {};
        session.translations[langName] = translationData;
        const sessionIndex = history.findIndex(s => s.id === session.id);
        if (sessionIndex !== -1) {
          history[sessionIndex] = session;
          writeHistory(history);
        }
      }

      res.json({
        ok: true,
        targetLanguage: langName,
        ...translationData
      });
    } catch (err) {
      console.error('[Upload Translate Error]:', err.message);
      res.status(500).json({ ok: false, error: 'Unable to translate the transcript.' });
    }
  });

  // Endpoint: Chat with the file context or general chat
  router.post('/chat', authenticateToken, async (req, res) => {
    const { sessionId, message, history: chatHistory } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, error: 'message is required.' });
    }

    try {
      const userId = req.user?.id || req.user?.userId;
      let session;
      let history = readHistory();

      if (sessionId) {
        session = history.find(s => s.id === sessionId && s.userId === userId);
      }

      // If no session exists yet, create a general chat session
      if (!session) {
        const newSessionId = sessionId || 'session-' + Date.now();
        session = {
          id: newSessionId,
          userId,
          fileName: 'General Chat',
          filePath: null,
          transcript: '',
          createdAt: new Date().toISOString(),
          title: message.length > 30 ? message.slice(0, 30) + '...' : message,
          messages: []
        };
        history.push(session);
        writeHistory(history);
      }

      // Query Grok (xAI) using conversation history and file transcript as context
      const grokKey = process.env.GROK_UPLOAD_API_KEY || process.env.GROQ_API_KEY;
      if (!grokKey) throw new Error('Grok API key is not set on the server.');

      const grokClient = new OpenAI({
        apiKey: grokKey,
        baseURL: 'https://api.x.ai/v1'
      });

      let systemPrompt = '';
      if (session.transcript && session.transcript.trim()) {
        systemPrompt = `You are a helpful assistant. You will be helping the user answer questions about an uploaded audio or video file using its transcript.
File Name: ${session.fileName}
File Transcript:
"""
${session.transcript}
"""

Instructions:
- Answer the user's question clearly and accurately based on the transcript context.
- Do NOT use markdown symbols like asterisks (**) or headers (###).
- Present text cleanly in plain layout.`;
      } else {
        systemPrompt = `You are a helpful assistant. Answer the user's questions clearly and accurately.
Instructions:
- Do NOT use markdown symbols like asterisks (**) or headers (###).
- Present text cleanly in plain layout.`;
      }

      const apiMessages = [{ role: 'system', content: systemPrompt }];
      if (chatHistory && Array.isArray(chatHistory)) {
        chatHistory.slice(-10).forEach(msg => {
          if (msg.sender === 'user') apiMessages.push({ role: 'user', content: msg.text });
          else if (msg.sender === 'ai') apiMessages.push({ role: 'assistant', content: msg.text });
        });
      }
      apiMessages.push({ role: 'user', content: message });

      const response = await grokClient.chat.completions.create({
        model: 'grok-4.20-0309-non-reasoning',
        messages: apiMessages,
        temperature: 0.5
      });

      const rawAiText = response.choices?.[0]?.message?.content?.trim() || 'I could not generate a response.';
      const aiText = cleanAiOutput(rawAiText);

      // Append new message pair to session history
      session.messages.push({ sender: 'user', text: message });
      session.messages.push({ sender: 'ai', text: aiText });
      
      const sessionIndex = history.findIndex(s => s.id === session.id);
      if (sessionIndex !== -1) {
        history[sessionIndex] = session;
      }
      writeHistory(history);

      res.json({ ok: true, reply: aiText, session });
    } catch (err) {
      console.error('[Upload Chat Error]:', err.message);
      res.status(500).json({ ok: false, error: 'Unable to answer the request.' });
    }
  });

  // Endpoint: Transcribe short microphone audio recorded from frontend
  router.post('/transcribe-mic', authenticateToken, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'No audio file received.' });
    }
    
    const filePath = file.path;
    const lang = req.query.lang || 'en-US';

    try {
      const dgKey = process.env.DEEPGRAM_API_KEY;
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY is not set on the server.');

      const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
      deepgramUrl.searchParams.set('model', 'nova-2');
      deepgramUrl.searchParams.set('smart_format', 'true');
      
      if (lang) {
        deepgramUrl.searchParams.set('language', lang);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const dgResponse = await fetch(deepgramUrl, {
        method: 'POST',
        headers: {
          Authorization: `Token ${dgKey}`,
          'Content-Type': file.mimetype
        },
        body: fileBuffer
      });

      if (!dgResponse.ok) {
        const errorText = await dgResponse.text();
        throw new Error(`Deepgram API returned ${dgResponse.status}: ${errorText}`);
      }

      const dgData = await dgResponse.json();
      const transcription = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      
      res.json({ ok: true, transcription });
    } catch (err) {
      console.error('[Upload Mic Transcribe Error]:', err.message);
      res.status(500).json({ ok: false, error: 'Unable to transcribe the audio.' });
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (_) {}
    }
  });

  return router;
}

module.exports = { createUploadRoutes };
