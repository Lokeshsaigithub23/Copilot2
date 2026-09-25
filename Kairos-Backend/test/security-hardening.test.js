const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const test = require('node:test');

const { createAuthService } = require('../src/services/auth.service');
const { createAuthController } = require('../src/controllers/auth.controller');
const { createSessionController, resolvePrivateFilePath } = require('../src/controllers/session.controller');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(filePath) { this.filePath = filePath; return this; }
  };
}

test('auth tokens use the configured short lifetime', () => {
  const secret = 'security-test-secret';
  const authService = createAuthService({
    db: {},
    config: { jwtSecret: secret, jwtExpiresIn: '1h' }
  });
  const result = authService.createAuthResponse({ id: 'user-1', email: 'user@example.com', name: 'User' });
  const payload = jwt.verify(result.token, secret);

  assert.ok(payload.exp);
  assert.ok(payload.iat);
  assert.ok(payload.exp - payload.iat <= 60 * 60);
});

test('login is rate limited after repeated failures', async () => {
  const controller = createAuthController({
    db: { getUserByEmail: async () => null },
    authService: {}
  });
  const request = { ip: '127.0.0.1', body: { email: 'user@example.com', password: 'wrong' } };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = response();
    await controller.login(request, res);
    assert.equal(res.statusCode, 401);
  }

  const limited = response();
  await controller.login(request, limited);
  assert.equal(limited.statusCode, 429);
});

test('private audio retrieval scopes the database lookup to the authenticated user', async () => {
  let requestedUserId = null;
  const controller = createSessionController({
    db: {
      getSessionByUser: async (sessionId, userId) => {
        requestedUserId = userId;
        return null;
      }
    },
    config: { uploadDirectory: process.cwd() }
  });
  const res = response();

  await controller.getAudio({ params: { id: 'session-1' }, user: { userId: 'user-2' } }, res);

  assert.equal(requestedUserId, 'user-2');
  assert.equal(res.statusCode, 404);
});

test('private file resolution rejects traversal outside the upload root', () => {
  const uploadRoot = require('node:path').resolve(__dirname, '..', 'uploads');
  assert.equal(resolvePrivateFilePath(uploadRoot, 'uploads/recording.webm'), require('node:path').resolve(__dirname, '..', 'uploads', 'recording.webm'));
  assert.equal(resolvePrivateFilePath(uploadRoot, 'uploads/../.env'), null);
});

test('bcrypt password verification remains asynchronous', async () => {
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const controller = createAuthController({
    db: { getUserByEmail: async () => ({ id: 'user-1', email: 'user@example.com', password: passwordHash }) },
    authService: { createAuthResponse: () => ({ token: 'test-token' }) }
  });
  const res = response();

  await controller.login({ ip: '127.0.0.2', body: { email: 'user@example.com', password: 'correct-password' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { token: 'test-token' });
});