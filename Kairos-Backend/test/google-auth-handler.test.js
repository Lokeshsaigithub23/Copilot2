const assert = require('node:assert/strict');
const test = require('node:test');

const { FirebaseTokenError } = require('../firebase-token-verifier');
const { createGoogleAuthHandler } = require('../google-auth-handler');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createLogger() {
  return {
    warnings: [],
    errors: [],
    warn(message) {
      this.warnings.push(message);
    },
    error(...messages) {
      this.errors.push(messages.join(' '));
    }
  };
}

test('returns the normal app session for an existing verified Google user', async () => {
  const existingUser = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Existing Person'
  };
  const db = {
    getUserByEmail: async (email) => {
      assert.equal(email, 'person@example.com');
      return existingUser;
    },
    createUser: async () => assert.fail('Existing users must not be recreated.')
  };
  const handler = createGoogleAuthHandler({
    db,
    firebaseTokenVerifier: {
      verifyIdToken: async () => ({
        email: 'Person@Example.com',
        email_verified: true,
        name: 'Google Person'
      })
    },
    createAuthResponse: (user) => ({ token: 'app-session-token', user }),
    logger: createLogger()
  });
  const response = createResponse();

  await handler({ body: { idToken: 'firebase-token' } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    token: 'app-session-token',
    user: existingUser
  });
});

test('creates a local profile on the first verified Google sign-in', async () => {
  let createdUserArgs = null;
  const createdUser = {
    id: 'user-2',
    email: 'new@example.com',
    name: 'New Person'
  };
  const db = {
    getUserByEmail: async () => null,
    createUser: async (...args) => {
      createdUserArgs = args;
      return createdUser;
    }
  };
  const handler = createGoogleAuthHandler({
    db,
    firebaseTokenVerifier: {
      verifyIdToken: async () => ({
        email: 'new@example.com',
        email_verified: true,
        name: 'New Person'
      })
    },
    createAuthResponse: (user) => ({ token: 'new-app-session', user }),
    generatePassword: () => 'generated-unusable-password',
    logger: createLogger()
  });
  const response = createResponse();

  await handler({ body: { idToken: 'firebase-token' } }, response);

  assert.deepEqual(createdUserArgs, [
    'new@example.com',
    'generated-unusable-password',
    'New Person'
  ]);
  assert.equal(response.body.token, 'new-app-session');
  assert.equal(response.body.user.id, 'user-2');
});

test('returns a sanitized 401 response for an invalid Firebase token', async () => {
  const logger = createLogger();
  const handler = createGoogleAuthHandler({
    db: {},
    firebaseTokenVerifier: {
      verifyIdToken: async () => {
        throw new FirebaseTokenError(
          'INVALID_FIREBASE_TOKEN',
          'private verification detail'
        );
      }
    },
    createAuthResponse: () => assert.fail('Invalid tokens must not create sessions.'),
    logger
  });
  const response = createResponse();

  await handler({ body: { idToken: 'bad-token' } }, response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: {
      code: 'INVALID_FIREBASE_TOKEN',
      message: 'Google sign-in could not be verified.'
    }
  });
  assert.equal(JSON.stringify(response.body).includes('private verification detail'), false);
  assert.equal(logger.warnings[0].includes('bad-token'), false);
});

test('returns 503 without exposing certificate-service errors', async () => {
  const logger = createLogger();
  const handler = createGoogleAuthHandler({
    db: {},
    firebaseTokenVerifier: {
      verifyIdToken: async () => {
        throw new FirebaseTokenError(
          'FIREBASE_CERTS_UNAVAILABLE',
          'internal bridge failed',
          503
        );
      }
    },
    createAuthResponse: () => assert.fail('Unavailable verification must fail closed.'),
    logger
  });
  const response = createResponse();

  await handler({ body: { idToken: 'firebase-token' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.message, 'Google sign-in is temporarily unavailable.');
  assert.equal(JSON.stringify(response.body).includes('internal bridge failed'), false);
});
