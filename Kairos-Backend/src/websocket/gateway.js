const { WebSocketServer, WebSocket } = require('ws');
const { verifyWebSocketToken } = require('../middleware/auth');
const { resolveSttProvider, getLanguageConfig } = require('../config/languages');

function normalizeCloseCode(code) {
  const isStandardCode = Number.isInteger(code) && code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code);
  const isApplicationCode = Number.isInteger(code) && code >= 3000 && code <= 4999;
  return isStandardCode || isApplicationCode ? code : 1000;
}

function handleGoogleTranscription(browserWs, source, sttConfig) {
  const apiKey = process.env.GOOGLE_SPEECH_KEY;
  if (!apiKey) {
    browserWs.send(JSON.stringify({ type: 'error', message: 'GOOGLE_SPEECH_KEY not configured on server.' }));
    return browserWs.close(4001, 'Google Speech key missing');
  }

  if (browserWs.readyState === WebSocket.OPEN) {
    browserWs.send(JSON.stringify({ type: 'ready', source }));
  }

  let audioBuffers = [];
  let totalBytes = 0;
  let transcribeInProgress = false;
  let debounceTimer = null;

  async function flushAudio() {
    if (audioBuffers.length === 0 || transcribeInProgress) return;
    const combined = Buffer.concat(audioBuffers);
    audioBuffers = [];
    totalBytes = 0;

    // Minimum audio ~0.3s (9600 bytes at 16kHz 16-bit mono) to avoid empty recognition calls
    if (combined.length < 9600) return;

    transcribeInProgress = true;
    try {
      const base64Audio = combined.toString('base64');
      const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: sttConfig.languageCode || 'ml-IN',
            enableAutomaticPunctuation: true
          },
          audio: { content: base64Audio }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const transcript = (data.results || [])
          .map(r => r.alternatives?.[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript && browserWs.readyState === WebSocket.OPEN) {
          console.log(`[google-stt] [${source}] text="${transcript}"`);
          browserWs.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            isFinal: true,
            source
          }));
        }
      }
    } catch (err) {
      console.error('[google-stt] Recognition error:', err.message);
    } finally {
      transcribeInProgress = false;
    }
  }

  browserWs.on('message', (chunk) => {
    if (Buffer.isBuffer(chunk)) {
      audioBuffers.push(chunk);
      totalBytes += chunk.length;

      // Flush every ~2.5s (80000 bytes) or debounce after 1200ms of pause
      if (totalBytes >= 80000) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
        flushAudio();
      } else {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          flushAudio();
        }, 1200);
      }
    }
  });

  browserWs.on('close', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    flushAudio();
  });
}

function handleSarvamTranscription(browserWs, source, sttConfig) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    browserWs.send(JSON.stringify({ type: 'error', message: 'SARVAM_API_KEY not configured on server.' }));
    return browserWs.close(4001, 'Sarvam API key missing');
  }

  const sarvamUrl = `wss://api.sarvam.ai/speech-to-text/ws?language-code=${sttConfig.languageCode || 'hi-IN'}&model=${sttConfig.model || 'saaras:v3'}`;
  const sarvamWs = new WebSocket(sarvamUrl, {
    headers: { 'api-subscription-key': apiKey }
  });

  sarvamWs.on('open', () => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: 'ready', source }));
    }
  });

  sarvamWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const transcript = msg.transcript || msg.text || '';
      const isFinal = msg.is_final !== false;
      if (transcript.trim() && browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(JSON.stringify({
          type: 'transcript',
          text: transcript.trim(),
          isFinal,
          source
        }));
      }
    } catch (_) {}
  });

  sarvamWs.on('error', (err) => {
    console.error('[sarvam-stt] WS error:', err.message);
  });

  sarvamWs.on('close', () => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.close(1000, 'Sarvam stream closed');
    }
  });

  browserWs.on('message', (chunk) => {
    if (sarvamWs.readyState === WebSocket.OPEN) {
      sarvamWs.send(chunk);
    }
  });

  browserWs.on('close', () => {
    if (sarvamWs.readyState === WebSocket.OPEN) sarvamWs.close();
  });
}

function buildDeepgramListenUrl({
  model = 'nova-3',
  language = 'en',
  encoding = 'linear16',
  sampleRate = '16000',
  paragraphs = false,
  diarize = false,
  keywords = ['Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'SQL', 'API', 'tuple']
} = {}) {
  const isNova3 = typeof model === 'string' && model.startsWith('nova-3');
  const keywordQuery = isNova3
    ? keywords.map((w) => `keyterm=${encodeURIComponent(w)}`).join('&')
    : keywords.map((w) => `keywords=${encodeURIComponent(w)}:2`).join('&');

  let deepgramUrl = `wss://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&language=${encodeURIComponent(language)}&smart_format=true&punctuate=true&paragraphs=${paragraphs}&interim_results=true&endpointing=300&${keywordQuery}`;
  if (diarize) {
    deepgramUrl += '&diarize=true';
  }
  if (encoding === 'linear16') {
    deepgramUrl += `&encoding=linear16&sample_rate=${sampleRate}&channels=1`;
  }
  return deepgramUrl;
}

function attachWebSocketGateway(httpServer, config) {
  const selectAuthProtocol = (protocols) => Array.from(protocols).find((protocol) => protocol.startsWith('bearer.')) || false;
  const transcribeServer = new WebSocketServer({ noServer: true, handleProtocols: selectAuthProtocol });
  const voiceAgentServer = new WebSocketServer({ noServer: true, handleProtocols: selectAuthProtocol });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!['/api/transcribe/live', '/api/voice-agent/converse'].includes(url.pathname)) return socket.destroy();
    const offeredProtocols = String(req.headers['sec-websocket-protocol'] || '')
      .split(',')
      .map((protocol) => protocol.trim());
    const authProtocol = offeredProtocols.find((protocol) => protocol.startsWith('bearer.'));
    const user = verifyWebSocketToken(authProtocol?.slice('bearer.'.length), config.jwtSecret);
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    req.user = user;
    const target = url.pathname === '/api/transcribe/live' ? transcribeServer : voiceAgentServer;
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  });

  transcribeServer.on('connection', (browserWs, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const source = url.searchParams.get('source') || 'candidate';
    const connectionId = `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const encoding = url.searchParams.get('encoding') || 'linear16';
    const sampleRate = url.searchParams.get('sample_rate') || '16000';
    const language = url.searchParams.get('language') || 'en';
    const engine = url.searchParams.get('engine') || 'auto';
    const paragraphs = url.searchParams.get('paragraphs') === 'true';
    const diarize = url.searchParams.get('diarize') === 'true';

    // Resolve STT provider via central language configuration
    const sttConfig = resolveSttProvider(language, engine);

    if (!sttConfig.supported) {
      console.warn(`[live-transcribe] Unsupported language or provider error for "${language}": ${sttConfig.error}`);
      browserWs.send(JSON.stringify({ type: 'error', message: sttConfig.error }));
      browserWs.close(4000, sttConfig.error);
      return;
    }

    console.log(`[live-transcribe] Connected. id=${connectionId} lang=${language} provider=${sttConfig.provider} model=${sttConfig.model || 'n/a'}`);

    // Route to Google Cloud Speech-to-Text handler
    if (sttConfig.provider === 'google') {
      return handleGoogleTranscription(browserWs, source, sttConfig);
    }

    // Route to Sarvam STT handler
    if (sttConfig.provider === 'sarvam') {
      return handleSarvamTranscription(browserWs, source, sttConfig);
    }

    // Deepgram STT handler (primary for supported languages)
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      browserWs.send(JSON.stringify({ type: 'error', message: 'DEEPGRAM_API_KEY not configured on server.' }));
      return browserWs.close(4001, 'Deepgram API key missing');
    }

    const dgModel = sttConfig.model || 'nova-3';
    const dgLang = sttConfig.languageCode || language;
    const deepgramUrl = buildDeepgramListenUrl({
      model: dgModel,
      language: dgLang,
      encoding,
      sampleRate,
      paragraphs,
      diarize
    });

    let browserClosed = false;
    let deepgramOpened = false;
    let deepgramWs = null;
    let keepAliveTimer = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let lastHandshakeError = null;

    const connectToDeepgram = () => {
      if (browserClosed) return;

      lastHandshakeError = null;
      deepgramWs = new WebSocket(deepgramUrl, { headers: { Authorization: `Token ${apiKey}` } });

      deepgramWs.on('unexpected-response', (req, res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            lastHandshakeError = parsed.err_msg || parsed.message || `Deepgram handshake failed with HTTP ${res.statusCode}`;
          } catch (_) {
            lastHandshakeError = `Deepgram handshake failed with HTTP ${res.statusCode}`;
          }
          console.error(`[live-transcribe] Deepgram handshake rejected HTTP ${res.statusCode}:`, lastHandshakeError);
          if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
            reconnectAttempts = maxReconnectAttempts;
            if (browserWs.readyState === WebSocket.OPEN) {
              browserWs.send(JSON.stringify({ type: 'error', message: `Deepgram error: ${lastHandshakeError}` }));
            }
          }
        });
      });

      deepgramWs.on('open', () => {
        deepgramOpened = true;
        reconnectAttempts = 0;
        keepAliveTimer = setInterval(() => {
          if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            deepgramWs.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 5000);
        if (browserWs.readyState === WebSocket.OPEN) browserWs.send(JSON.stringify({ type: 'ready', source }));
      });
      deepgramWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          const alternative = message?.channel?.alternatives?.[0];
          const transcript = alternative?.transcript || '';
          const words = Array.isArray(alternative?.words) ? alternative.words : [];
          const isFinal = message?.is_final === true;

          if (!transcript.trim()) return;

          // When diarization is enabled, partition consecutive words by speaker into turns
          if (diarize && words.length > 0) {
            const turns = [];
            let currentSpeaker = words[0].speaker !== undefined ? words[0].speaker : 0;
            let currentWords = [];

            for (const w of words) {
              const sp = w.speaker !== undefined ? w.speaker : currentSpeaker;
              if (sp !== currentSpeaker && currentWords.length > 0) {
                turns.push({
                  speaker: currentSpeaker,
                  text: currentWords.map(item => item.punctuated_word || item.word).join(' ')
                });
                currentSpeaker = sp;
                currentWords = [w];
              } else {
                currentWords.push(w);
              }
            }
            if (currentWords.length > 0) {
              turns.push({
                speaker: currentSpeaker,
                text: currentWords.map(item => item.punctuated_word || item.word).join(' ')
              });
            }

            if (turns.length > 0) {
              for (const turn of turns) {
                const turnText = turn.text.trim();
                if (turnText) {
                  console.log(`[live-transcribe] [${source}] speaker=${turn.speaker} text="${turnText}" isFinal=${isFinal}`);
                  browserWs.send(JSON.stringify({
                    type: 'transcript',
                    text: turnText,
                    isFinal,
                    source,
                    speaker: turn.speaker
                  }));
                }
              }
              return;
            }
          }

          const fallbackSpeaker = words.length > 0 && words[0].speaker !== undefined ? words[0].speaker : undefined;
          console.log(`[live-transcribe] [${source}] text="${transcript}" isFinal=${isFinal}${fallbackSpeaker !== undefined ? ` speaker=${fallbackSpeaker}` : ''}`);
          browserWs.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            isFinal,
            source,
            ...(fallbackSpeaker !== undefined ? { speaker: fallbackSpeaker } : {})
          }));
        } catch (err) { console.error('[live-transcribe] Failed to parse Deepgram message:', err.message); }
      });
      deepgramWs.on('error', (err) => {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        keepAliveTimer = null;
        console.error('[live-transcribe] Deepgram WS error:', err.message);
      });
      deepgramWs.on('close', (code, reason) => {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        keepAliveTimer = null;
        console.log(`[live-transcribe] Deepgram WS closed. id=${connectionId} code=${code} reason=${reason ? reason.toString() : 'none'} browserClosed=${browserClosed} deepgramOpened=${deepgramOpened}`);
        if (browserClosed || browserWs.readyState !== WebSocket.OPEN) return;

        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts += 1;
          const delay = Math.min(1000 * (2 ** (reconnectAttempts - 1)), 5000);
          console.warn(`[live-transcribe] Reconnecting Deepgram. id=${connectionId} attempt=${reconnectAttempts}/${maxReconnectAttempts} delayMs=${delay}`);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectToDeepgram();
          }, delay);
          return;
        }

        const errMsg = lastHandshakeError ? `Transcription error: ${lastHandshakeError}` : 'Live transcription provider disconnected. Please restart capture.';
        browserWs.send(JSON.stringify({ type: 'error', message: errMsg }));
        browserWs.close(1011, errMsg);
      });
    };

    connectToDeepgram();
    browserWs.on('message', (chunk) => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(chunk);
    });
    browserWs.on('close', () => {
      browserClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      reconnectTimer = null;
      keepAliveTimer = null;
      console.log(`[live-transcribe] Browser WS closed. id=${connectionId}; requesting Deepgram shutdown.`);
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(Buffer.alloc(0));
        deepgramWs.close();
      } else if (deepgramWs && deepgramWs.readyState === WebSocket.CONNECTING) {
        deepgramWs.close();
      }
    });
    browserWs.on('error', (err) => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      console.error('[live-transcribe] Browser WS error:', err.message);
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close();
    });
  });

  voiceAgentServer.on('connection', (browserWs) => {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) { browserWs.send(JSON.stringify({ type: 'Error', message: 'DEEPGRAM_API_KEY not configured on server.' })); return browserWs.close(); }
    const deepgramWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', ['token', apiKey]);
    const queue = [];
    deepgramWs.on('open', () => { while (queue.length) { const item = queue.shift(); deepgramWs.send(item.data, { binary: item.isBinary }); } });
    deepgramWs.on('message', (data, isBinary) => { if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data, { binary: isBinary }); });
    deepgramWs.on('error', (err) => { console.error('[voice-agent] Provider error:', err.message); if (browserWs.readyState === WebSocket.OPEN) browserWs.send(JSON.stringify({ type: 'Error', message: 'Voice agent provider is temporarily unavailable.' })); });
    deepgramWs.on('close', (code) => { if (browserWs.readyState === WebSocket.OPEN) browserWs.close(normalizeCloseCode(code)); });
    browserWs.on('message', (data, isBinary) => { if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.send(data, { binary: isBinary }); else queue.push({ data, isBinary }); });
    browserWs.on('close', () => { if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close(); });
    browserWs.on('error', (err) => { console.error('[voice-agent] Browser WS error:', err.message); if (deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close(); });
  });
}

module.exports = { attachWebSocketGateway, normalizeCloseCode, buildDeepgramListenUrl };