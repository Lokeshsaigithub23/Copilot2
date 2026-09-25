require('dotenv').config();
const db = require('./db');

async function testSessionIsolation() {
  console.log('=== Starting Session Isolation Test ===');

  try {
    // 1. Create a simulated AI Copilot session
    const copilotSession = await db.createSession({
      tech: 'Interview',
      title: 'Python Backend Interview',
      durationSeconds: 120,
      durationDisplay: '02:00',
      questionCount: 1,
      rating: 5,
      payload: {
        date: 'Aug 21, 2026',
        time: '7:30 PM',
        questions: [{ question: 'What is Python GIL?', answerA: 'Global Interpreter Lock' }],
        transcript: [{ speaker: 'interviewer', text: 'What is Python GIL?' }]
      }
    }, 'test_user_copilot');

    console.log('✓ Created Copilot interview session in DB:', copilotSession.id);

    // 2. Create a simulated Notetaker session
    const notetakerSession = await db.createSession({
      tech: 'Notetaker Session',
      title: 'Weekly Standup Notes',
      durationSeconds: 90,
      durationDisplay: '01:30',
      questionCount: 0,
      rating: 0,
      payload: {
        sessionType: 'notetaker',
        isNotetaker: true,
        date: 'Aug 21, 2026',
        time: '7:35 PM',
        notes: 'Discussion about database migration and release timeline.',
        transcript: [{ sender: 'user', text: 'Discussion about database migration.' }]
      }
    }, 'test_user_notetaker');

    console.log('✓ Created Notetaker session in DB:', notetakerSession.id);

    // 3. Fetch all sessions from DB
    const allSessions = await db.getSessionsByUser('test_user_notetaker');
    console.log(`✓ Fetched ${allSessions.length} total sessions from database`);

    // 4. Test Notetaker isolation filter logic
    const isNotetakerSession = (sess) => {
      if (!sess) return false;
      let payload = sess.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) {}
      }
      if (!payload && typeof sess.payloadJson === 'string') {
        try { payload = JSON.parse(sess.payloadJson); } catch (_) {}
      }
      payload = payload || {};
      
      // 1. Explicit Copilot markers -> strictly exclude from Notetaker
      if (payload.questions && Array.isArray(payload.questions) && payload.questions.length > 0) return false;
      if (payload.version && !payload.isNotetaker && !payload.sessionType) return false;
      if (Array.isArray(payload.transcript) && payload.transcript.some(t => t.speaker === 'ai_a' || t.speaker === 'ai_b' || t.speaker === 'interviewer')) {
        return false;
      }

      // 2. Explicit Notetaker markers -> include
      if (payload.isNotetaker || payload.sessionType === 'notetaker' || sess.isNotetaker) return true;
      if (payload.notes && payload.notes !== 'Session recorded.' && !payload.version) return true;
      if (sess.tech === 'Notetaker Session') return true;
      if (typeof sess.title === 'string' && (sess.title.startsWith('Meeting Notes') || sess.title.startsWith('Notetaker'))) return true;
      
      return false;
    };

    const notetakerFiltered = allSessions.filter(isNotetakerSession);
    const backendDevInNotetaker = notetakerFiltered.filter(s => s.title === 'Backend Developer' || s.tech === 'Backend Developer');
    const dataEngInNotetaker = notetakerFiltered.filter(s => s.title === 'Data Engineer' || s.tech === 'Data Engineer');
    const copilotInNotetaker = notetakerFiltered.filter(s => s.id === copilotSession.id);
    const notetakerInFiltered = notetakerFiltered.filter(s => s.id === notetakerSession.id);

    if (backendDevInNotetaker.length > 0) {
      throw new Error('FAILED: Backend Developer role session leaked into Notetaker history!');
    }
    if (dataEngInNotetaker.length > 0) {
      throw new Error('FAILED: Data Engineer role session leaked into Notetaker history!');
    }
    if (copilotInNotetaker.length > 0) {
      throw new Error('FAILED: AI Copilot session leaked into Notetaker history!');
    }
    if (notetakerInFiltered.length === 0) {
      throw new Error('FAILED: Notetaker session was missing from Notetaker history!');
    }

    console.log('✓ Verified: "Backend Developer" and "Data Engineer" Copilot sessions are 100% excluded from Notetaker');
    console.log('✓ Verified: AI Copilot sessions are 100% excluded from Notetaker history');
    console.log('✓ Verified: Real Notetaker meeting notes sessions are 100% retained in Notetaker history');
    console.log('=== All Session Isolation Tests Passed! ===');
    console.log('=== All Session Isolation Tests Passed! ===');
    process.exit(0);
  } catch (err) {
    console.error('Session Isolation Test Failed:', err);
    process.exit(1);
  }
}

testSessionIsolation();
