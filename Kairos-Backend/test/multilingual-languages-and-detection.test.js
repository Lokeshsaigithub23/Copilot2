const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const {
  LANGUAGES,
  getLanguageConfig,
  resolveSttProvider,
  getAllLanguages
} = require('../src/config/languages');

const {
  isInterviewQuestion,
  generateAnswerStreaming,
  getLanguageCode
} = require('../copilotEngine');

const { createApp } = require('../src/app');
const { buildDeepgramListenUrl } = require('../src/websocket/gateway');

// ─────────────────────────────────────────
// 1. Language Configuration & Model Mapping Tests
// ─────────────────────────────────────────

test('central language registry defines all 9 Indian languages', () => {
  const indicCodes = ['en', 'hi', 'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'bn'];
  for (const code of indicCodes) {
    const config = getLanguageConfig(code);
    assert.ok(config, `Language config missing for ${code}`);
    assert.equal(config.code, code);
    assert.ok(config.name, `Missing name for ${code}`);
    assert.ok(config.nativeName, `Missing nativeName for ${code}`);
  }
});

test('central language registry defines international languages', () => {
  const intlCodes = ['es', 'fr', 'de', 'pt', 'it', 'ru', 'ja', 'ko', 'zh', 'ar', 'nl', 'id'];
  for (const code of intlCodes) {
    const config = getLanguageConfig(code);
    assert.ok(config, `Language config missing for ${code}`);
    assert.equal(config.code, code);
    assert.equal(config.group, 'international');
  }
});

test('resolves correct Deepgram models per language capability', () => {
  // English and Hindi use nova-2 (or nova-3)
  const enStt = resolveSttProvider('en');
  assert.equal(enStt.supported, true);
  assert.equal(enStt.provider, 'deepgram');
  assert.equal(enStt.model, 'nova-2');

  const hiStt = resolveSttProvider('hi');
  assert.equal(hiStt.supported, true);
  assert.equal(hiStt.provider, 'deepgram');
  assert.equal(hiStt.model, 'nova-2');

  // Telugu, Tamil, Marathi, Gujarati, Kannada, Bengali require nova-3
  for (const code of ['te', 'ta', 'mr', 'gu', 'kn', 'bn']) {
    const stt = resolveSttProvider(code);
    assert.equal(stt.supported, true, `Expected ${code} to be supported`);
    assert.equal(stt.provider, 'deepgram');
    assert.equal(stt.model, 'nova-3', `Expected ${code} to use nova-3`);
  }
});

test('resolves fallback provider for Malayalam (unsupported on Deepgram)', () => {
  const mlConfig = getLanguageConfig('ml');
  assert.equal(mlConfig.deepgram.supported, false, 'Deepgram should not claim ml support');

  // Should resolve to Google STT or Sarvam fallback
  const mlStt = resolveSttProvider('ml');
  assert.equal(mlStt.supported, true);
  assert.ok(['google', 'sarvam'].includes(mlStt.provider));
  assert.equal(mlStt.isFallback, true);
  assert.equal(mlStt.languageCode, 'ml-IN');
});

test('reports descriptive error for unknown / unsupported languages', () => {
  const invalidStt = resolveSttProvider('xx-unknown-lang');
  // Unknown falls back to en or reports error
  const res = resolveSttProvider('unsupported_xyz');
  assert.ok(res);
});

test('buildDeepgramListenUrl formats parameters correctly for Nova-3 and Nova-2', () => {
  // Nova-3 (e.g. Telugu) must use keyterm and NOT keywords
  const teUrl = buildDeepgramListenUrl({
    model: 'nova-3',
    language: 'te',
    encoding: 'linear16',
    sampleRate: '16000',
    paragraphs: false,
    diarize: true
  });
  assert.ok(teUrl.includes('model=nova-3'), 'Must contain model=nova-3');
  assert.ok(teUrl.includes('language=te'), 'Must contain language=te');
  assert.ok(teUrl.includes('keyterm=Python'), 'Nova-3 must use keyterm');
  assert.ok(!teUrl.includes('keywords='), 'Nova-3 must NOT use keywords');
  assert.ok(teUrl.includes('&diarize=true'), 'Must include diarize');
  assert.ok(teUrl.includes('&encoding=linear16&sample_rate=16000&channels=1'), 'Must include linear16 audio config');

  // Nova-2 (e.g. English) must use keywords and NOT keyterm
  const enUrl = buildDeepgramListenUrl({
    model: 'nova-2',
    language: 'en',
    encoding: 'linear16',
    sampleRate: '16000',
    paragraphs: false,
    diarize: false
  });
  assert.ok(enUrl.includes('model=nova-2'), 'Must contain model=nova-2');
  assert.ok(enUrl.includes('language=en'), 'Must contain language=en');
  assert.ok(enUrl.includes('keywords=Python%3A2') || enUrl.includes('keywords=Python:2'), 'Nova-2 must use keywords');
  assert.ok(!enUrl.includes('keyterm='), 'Nova-2 must NOT use keyterm');
  assert.ok(!enUrl.includes('diarize=true'), 'Should not include diarize when false');
});

// ─────────────────────────────────────────
// 2. Multilingual Question Detection Tests
// ─────────────────────────────────────────

test('detects English technical interview questions (regression test)', () => {
  assert.equal(isInterviewQuestion('What is the difference between an array and a linked list?'), true);
  assert.equal(isInterviewQuestion('Explain how polymorphism works in Java.'), true);
  assert.equal(isInterviewQuestion('Could you walk me through your recent project?'), true);
  assert.equal(isInterviewQuestion('Tell me about a challenging bug you fixed.'), true);
  assert.equal(isInterviewQuestion('8 + 1 = ?'), true);
});

test('rejects English greetings and fillers (regression test)', () => {
  assert.equal(isInterviewQuestion('Hello everyone'), false);
  assert.equal(isInterviewQuestion('good morning sir'), false);
  assert.equal(isInterviewQuestion('okay'), false);
  assert.equal(isInterviewQuestion('thanks for your time'), false);
  assert.equal(isInterviewQuestion('yeah got it'), false);
});

test('detects Hindi questions and prompts (regression test)', () => {
  assert.equal(isInterviewQuestion('जावा और सी में क्या अंतर है?'), true);
  assert.equal(isInterviewQuestion('पायथन में लिस्ट और टुपल में क्या अंतर है'), true);
  assert.equal(isInterviewQuestion('अपने प्रोजेक्ट के बारे में बताइए'), true);
  assert.equal(isInterviewQuestion('namaste ji'), false);
  assert.equal(isInterviewQuestion('नमस्ते'), false);
});

test('detects Telugu questions and prompts with SOV structure', () => {
  // Question with mid/end question words
  assert.equal(isInterviewQuestion('పైథాన్ లో లిస్ట్ మరియు ట్యూపుల్ మధ్య తేడా ఏమిటి', false, 'te'), true);
  assert.equal(isInterviewQuestion('మీ ప్రాజెక్ట్ గురించి వివరించండి', false, 'te'), true);
  assert.equal(isInterviewQuestion('రియాక్ట్ లో యూజ్ ఎఫెక్ట్ ఎలా పనిచేస్తుంది?', false, 'te'), true);
  assert.equal(isInterviewQuestion('తేడా ఏమిటి', false, 'te'), true);
  assert.equal(isInterviewQuestion('జావాస్క్రిప్ట్ లో ప్రామిసెస్ గురించి చెప్పండి', false, 'te'), true);

  // Non-question / greeting rejection
  assert.equal(isInterviewQuestion('నమస్కారం', false, 'te'), false);
  assert.equal(isInterviewQuestion('ధన్యవాదాలు', false, 'te'), false);
  assert.equal(isInterviewQuestion('సరే', false, 'te'), false);
});

test('detects Tamil questions and prompts', () => {
  assert.equal(isInterviewQuestion('பைதான் என்றால் என்ன', false, 'ta'), true);
  assert.equal(isInterviewQuestion('ரியாக்ட் பற்றி சொல்லுங்கள்', false, 'ta'), true);
  assert.equal(isInterviewQuestion('வணக்கம்', false, 'ta'), false);
  assert.equal(isInterviewQuestion('நன்றி', false, 'ta'), false);
});

test('detects Kannada questions and prompts', () => {
  assert.equal(isInterviewQuestion('ಪೈಥಾನ್ ಎಂದರೇನು ಮತ್ತು ಅದರ ವೈಶಿಷ್ಟ್ಯಗಳೇನು?', false, 'kn'), true);
  assert.equal(isInterviewQuestion('ನಿಮ್ಮ ಪ್ರಾಜೆಕ್ಟ್ ಬಗ್ಗೆ ಹೇಳಿ', false, 'kn'), true);
  assert.equal(isInterviewQuestion('ನಮಸ್ಕಾರ', false, 'kn'), false);
});

test('detects Marathi, Gujarati, Malayalam, and Bengali questions', () => {
  // Marathi
  assert.equal(isInterviewQuestion('पायथन आणि जावा मधील फरक काय आहे?', false, 'mr'), true);
  assert.equal(isInterviewQuestion('तुमच्या अनुभवाबद्दल सांगा', false, 'mr'), true);

  // Gujarati
  assert.equal(isInterviewQuestion('પાયથોન શું છે અને તેનો ઉપયોગ શું છે?', false, 'gu'), true);
  assert.equal(isInterviewQuestion('તમારા પ્રોજેક્ટ વિશે કહો', false, 'gu'), true);

  // Malayalam
  assert.equal(isInterviewQuestion('പൈത്തണും ജാവയും തമ്മിലുള്ള വ്യത്യാസം എന്താണ്?', false, 'ml'), true);
  assert.equal(isInterviewQuestion('നിങ്ങളുടെ പ്രോജക്റ്റിനെ കുറിച്ച് പറയൂ', false, 'ml'), true);

  // Bengali
  assert.equal(isInterviewQuestion('পাইথন এবং জাভার মধ্যে পার্থক্য কি?', false, 'bn'), true);
  assert.equal(isInterviewQuestion('আপনার পূর্ববর্তী অভিজ্ঞতা সম্পর্কে বলুন', false, 'bn'), true);
});

test('detects International language questions (Spanish, French, German)', () => {
  assert.equal(isInterviewQuestion('¿Cuál es la diferencia entre let y const en JavaScript?', false, 'es'), true);
  assert.equal(isInterviewQuestion("Qu'est-ce que l'héritage en programmation orientée objet?", false, 'fr'), true);
  assert.equal(isInterviewQuestion('Was ist der Unterschied zwischen SQL und NoSQL?', false, 'de'), true);
  assert.equal(isInterviewQuestion('hola gracias', false, 'es'), false);
});

// ─────────────────────────────────────────
// 3. Copilot Answer API Endpoint Tests
// ─────────────────────────────────────────

test('copilot answer endpoint accepts Telugu question and streams SSE response', async (t) => {
  const app = createApp({
    db: { ready: Promise.resolve() },
    config: {
      jwtSecret: 'test-jwt-secret-xyz',
      corsOrigins: ['http://localhost:3000']
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const jwt = require('jsonwebtoken');
  const testToken = jwt.sign({ id: 1, email: 'candidate@example.com' }, 'test-jwt-secret-xyz', { expiresIn: '1h' });

  // Test /api/copilot/answer
  const res = await fetch(`http://127.0.0.1:${port}/api/copilot/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify({
      text: 'పైథాన్ లో లిస్ట్ మరియు ట్యూపుల్ మధ్య తేడా ఏమిటి',
      forceQuestion: true,
      language: 'te',
      history: []
    })
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/i);

  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /ai-answer-start/i);
  reader.cancel();
});

test('copilot answer alias /api/copilot-answer is reachable and active', async (t) => {
  const app = createApp({
    db: { ready: Promise.resolve() },
    config: {
      jwtSecret: 'test-jwt-secret-xyz',
      corsOrigins: ['http://localhost:3000']
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const jwt = require('jsonwebtoken');
  const testToken = jwt.sign({ id: 1, email: 'candidate@example.com' }, 'test-jwt-secret-xyz', { expiresIn: '1h' });

  const res = await fetch(`http://127.0.0.1:${port}/api/copilot-answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify({
      text: 'What is polymorphism in Java?',
      forceQuestion: true,
      language: 'en'
    })
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/i);

  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /ai-answer-start/i);
  reader.cancel();
});

test('copilot answer endpoint rejects non-questions when forceQuestion is false', async (t) => {
  const app = createApp({
    db: { ready: Promise.resolve() },
    config: {
      jwtSecret: 'test-jwt-secret-xyz',
      corsOrigins: ['http://localhost:3000']
    }
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const jwt = require('jsonwebtoken');
  const testToken = jwt.sign({ id: 1, email: 'candidate@example.com' }, 'test-jwt-secret-xyz', { expiresIn: '1h' });

  const res = await fetch(`http://127.0.0.1:${port}/api/copilot/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`
    },
    body: JSON.stringify({
      text: 'Hello everyone thanks for having me',
      forceQuestion: false,
      language: 'en'
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.isQuestion, false);
});
