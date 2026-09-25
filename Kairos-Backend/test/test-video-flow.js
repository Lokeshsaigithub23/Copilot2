/**
 * ──────────────────────────────────────────────────────────────────
 * Video Upload Flow — End-to-End Test Script
 * ──────────────────────────────────────────────────────────────────
 *
 * This script tests the complete video upload → audio conversion flow.
 * It creates its own test server so you don't need a running server.
 *
 * HOW TO RUN:
 *   source ~/.nvm/nvm.sh && nvm use 20
 *   node test/test-video-flow.js
 *
 * PREREQUISITES:
 *   1. FFmpeg installed (brew install ffmpeg)
 *   2. A test video at uploads/test-video.mp4 (any small .mp4 file)
 *      If missing, the script creates a tiny test video using FFmpeg.
 * ──────────────────────────────────────────────────────────────────
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_VIDEO_PATH = path.join(ROOT, 'uploads/test-video.mp4');

// ─── Colors for console output ───
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

// ─── Ensure test video exists ───
function ensureTestVideo() {
  if (fs.existsSync(TEST_VIDEO_PATH)) {
    log('📹', `Test video exists: ${TEST_VIDEO_PATH} (${fs.statSync(TEST_VIDEO_PATH).size} bytes)`);
    return;
  }

  log('📹', 'Creating a small test video using FFmpeg...');
  try {
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -c:a aac -shortest "${TEST_VIDEO_PATH}"`,
      { stdio: 'pipe' }
    );
    log('✅', `Test video created: ${TEST_VIDEO_PATH}`);
  } catch (err) {
    console.error(c.red('Failed to create test video with FFmpeg.'));
    console.error('Please place any small .mp4 file at: ' + TEST_VIDEO_PATH);
    process.exit(1);
  }
}

// ─── Main Test ───
async function runTests() {
  console.log('\n' + c.bold('═══════════════════════════════════════════════════════'));
  console.log(c.bold('  🎬 Video Upload Flow — End-to-End Test'));
  console.log(c.bold('═══════════════════════════════════════════════════════') + '\n');

  // Step 0: Ensure test video
  ensureTestVideo();

  // Step 1: Boot test server
  log('🚀', c.cyan('Step 1: Starting test server...'));

  const jwtSecret = 'test-secret-key-12345';
  const mockConfig = {
    jwtSecret,
    uploadDirectory: path.join(ROOT, 'uploads'),
    corsOrigins: [],
    s3: { enabled: false, bucket: '', region: 'ap-south-1' }
  };

  const mockDb = { ready: Promise.resolve() };

  const { createApp } = require(path.join(ROOT, 'src/app'));
  const app = createApp({ db: mockDb, config: mockConfig });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  log('✅', c.green(`Test server running on http://localhost:${port}`));

  // Step 2: Create JWT tokens for two users (to test isolation)
  log('🔑', c.cyan('Step 2: Creating JWT tokens for 2 test users...'));

  const userA = { id: 'user-alice-001', email: 'alice@test.com', name: 'Alice' };
  const userB = { id: 'user-bob-002', email: 'bob@test.com', name: 'Bob' };

  const tokenA = jwt.sign({ userId: userA.id, email: userA.email, name: userA.name }, jwtSecret, { expiresIn: '1h' });
  const tokenB = jwt.sign({ userId: userB.id, email: userB.email, name: userB.name }, jwtSecret, { expiresIn: '1h' });

  log('✅', c.green(`Token A (Alice): ${tokenA.substring(0, 30)}...`));
  log('✅', c.green(`Token B (Bob):   ${tokenB.substring(0, 30)}...`));

  const BASE = `http://localhost:${port}`;
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      passedTests++;
      log('✅', c.green(`PASS: ${testName}`));
    } else {
      log('❌', c.red(`FAIL: ${testName}`));
    }
  }

  // ───────────────────────────────────────
  // TEST 1: Upload video as Alice
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 1: Upload Video (Alice) ───'));

  const fileBuffer = fs.readFileSync(TEST_VIDEO_PATH);
  const blob = new Blob([fileBuffer], { type: 'video/mp4' });
  const form = new FormData();
  form.append('video', blob, 'test-video.mp4');

  const uploadRes = await fetch(`${BASE}/api/video/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenA}` },
    body: form
  });

  const uploadJson = await uploadRes.json();
  log('📦', `Upload response: ${JSON.stringify(uploadJson, null, 2)}`);

  assert(uploadRes.status === 200, 'Upload returns 200');
  assert(uploadJson.ok === true, 'Upload response ok=true');
  assert(!!uploadJson.jobId, 'Upload returns jobId');

  const jobIdA = uploadJson.jobId;

  // ───────────────────────────────────────
  // TEST 2: Poll status until completed
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 2: Poll Conversion Status ───'));

  let jobResult = null;
  for (let attempt = 1; attempt <= 60; attempt++) {
    await new Promise((r) => setTimeout(r, 500));

    const statusRes = await fetch(`${BASE}/api/video/status/${jobIdA}?poll=true`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}`, 'Accept': 'application/json' }
    });

    const statusJson = await statusRes.json();
    log('⏳', `Poll #${attempt}: status = ${c.yellow(statusJson.status)}`);

    if (statusJson.status === 'completed') {
      jobResult = statusJson;
      break;
    }
    if (statusJson.status === 'error') {
      log('❌', c.red(`Conversion error: ${statusJson.message}`));
      break;
    }
  }

  assert(!!jobResult, 'Conversion completed within timeout');
  assert(jobResult?.audioUrl, 'Audio URL returned');
  assert(jobResult?.audioFileName, 'Audio filename returned');

  if (jobResult) {
    log('🎵', `Audio URL: ${jobResult.audioUrl}`);
    log('🎵', `Audio File: ${jobResult.audioFileName}`);
  }

  // ───────────────────────────────────────
  // TEST 3: Verify original video is DELETED
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 3: Verify Video Deleted ───'));

  const videoDir = path.join(ROOT, 'uploads/meta/video');
  // The uploaded file's multer filename is in uploadJson.video.url
  const uploadedVideoFilename = path.basename(uploadJson.video?.url || '');
  const uploadedVideoPath = path.join(videoDir, uploadedVideoFilename);

  const videoDeleted = !fs.existsSync(uploadedVideoPath);
  assert(videoDeleted, `Original video file deleted from disk: ${uploadedVideoFilename}`);

  // ───────────────────────────────────────
  // TEST 4: Verify audio file is accessible
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 4: Verify Audio File Accessible ───'));

  if (jobResult?.audioUrl) {
    const audioRes = await fetch(`${BASE}${jobResult.audioUrl}`);
    assert(audioRes.status === 200, `Audio file accessible at ${jobResult.audioUrl}`);
    assert(parseInt(audioRes.headers.get('content-length') || '0') > 0, 'Audio file has content');
    log('📊', `Audio size: ${audioRes.headers.get('content-length')} bytes`);
  }

  // ───────────────────────────────────────
  // TEST 5: Verify token in query parameter works
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 5: Token via Query Parameter ───'));

  const queryAuthRes = await fetch(`${BASE}/api/video/status/${jobIdA}?poll=true&token=${tokenA}`);
  const queryAuthJson = await queryAuthRes.json();
  assert(queryAuthRes.status === 200, 'Query parameter token auth works');
  assert(queryAuthJson.status === 'completed', 'Returns completed status via query token');

  // ───────────────────────────────────────
  // TEST 6: List sessions — Alice should see her session
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 6: List Sessions (Alice) ───'));

  const sessionsResA = await fetch(`${BASE}/api/video/sessions`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const sessionsJsonA = await sessionsResA.json();

  assert(sessionsResA.status === 200, 'Sessions endpoint returns 200');
  assert(sessionsJsonA.ok === true, 'Sessions response ok=true');
  assert(sessionsJsonA.sessions?.length > 0, 'Alice has at least 1 session');
  assert(sessionsJsonA.sessions?.[0]?.videoFileName === 'test-video.mp4', 'Session has correct fileName');

  log('📋', `Alice's sessions: ${sessionsJsonA.sessions?.length}`);

  // ───────────────────────────────────────
  // TEST 7: User isolation — Bob should NOT see Alice's sessions
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 7: User Isolation (Bob) ───'));

  const sessionsResB = await fetch(`${BASE}/api/video/sessions`, {
    headers: { 'Authorization': `Bearer ${tokenB}` }
  });
  const sessionsJsonB = await sessionsResB.json();

  assert(sessionsJsonB.sessions?.length === 0, 'Bob sees 0 sessions (isolation works)');

  // Bob tries to access Alice's job
  const bobStatusRes = await fetch(`${BASE}/api/video/status/${jobIdA}?poll=true`, {
    headers: { 'Authorization': `Bearer ${tokenB}`, 'Accept': 'application/json' }
  });
  assert(bobStatusRes.status === 404, 'Bob cannot access Alice\'s job (404)');

  // ───────────────────────────────────────
  // TEST 8: Get specific session detail
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 8: Get Session Detail ───'));

  const sessionDetailRes = await fetch(`${BASE}/api/video/session/${jobIdA}`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const sessionDetailJson = await sessionDetailRes.json();

  assert(sessionDetailRes.status === 200, 'Session detail returns 200');
  assert(sessionDetailJson.session?.audioUrl, 'Session detail has audioUrl');
  assert(sessionDetailJson.session?.userId === userA.id, 'Session belongs to Alice');

  // ───────────────────────────────────────
  // TEST 9: Delete session
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 9: Delete Session ───'));

  const deleteRes = await fetch(`${BASE}/api/video/session/${jobIdA}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const deleteJson = await deleteRes.json();

  assert(deleteRes.status === 200, 'Delete returns 200');
  assert(deleteJson.ok === true, 'Delete response ok=true');

  // Verify session is gone
  const afterDeleteRes = await fetch(`${BASE}/api/video/sessions`, {
    headers: { 'Authorization': `Bearer ${tokenA}` }
  });
  const afterDeleteJson = await afterDeleteRes.json();

  // Filter out sessions from this specific test only
  const remainingSessions = afterDeleteJson.sessions?.filter(s => s.id === jobIdA) || [];
  assert(remainingSessions.length === 0, 'Session removed from history after delete');

  // ───────────────────────────────────────
  // TEST 10: No auth → 401
  // ───────────────────────────────────────
  console.log('\n' + c.bold('─── Test 10: Auth Required ───'));

  const noAuthRes = await fetch(`${BASE}/api/video/upload`, { method: 'POST' });
  assert(noAuthRes.status === 401, 'Upload without token returns 401');

  const noAuthSessionsRes = await fetch(`${BASE}/api/video/sessions`);
  assert(noAuthSessionsRes.status === 401, 'Sessions without token returns 401');

  // ───────────────────────────────────────
  // RESULTS
  // ───────────────────────────────────────
  server.close();

  console.log('\n' + c.bold('═══════════════════════════════════════════════════════'));
  if (passedTests === totalTests) {
    console.log(c.bold(c.green(`  🎉 ALL ${totalTests} TESTS PASSED! Everything working 100%! 🎉`)));
  } else {
    console.log(c.bold(c.red(`  ⚠️  ${passedTests}/${totalTests} tests passed. ${totalTests - passedTests} failed.`)));
  }
  console.log(c.bold('═══════════════════════════════════════════════════════') + '\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error(c.red('TEST CRASH:'), err);
  process.exit(1);
});
