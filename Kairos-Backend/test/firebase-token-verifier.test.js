const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const {
  createFirebaseTokenVerifier,
  parseCacheTtl
} = require('../firebase-token-verifier');

const PROJECT_ID = 'copilotiq-test-project';
const KEY_ID = 'firebase-key-1';
const NOW_MS = Date.now();
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048
});
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

function signFirebaseToken(overrides = {}, options = {}) {
  const payload = {
    email: 'person@example.com',
    email_verified: true,
    iat: NOW_SECONDS - 30,
    auth_time: NOW_SECONDS - 30,
    name: 'Test Person',
    firebase: { sign_in_provider: 'google.com' },
    ...overrides
  };

  return jwt.sign(payload, privateKeyPem, {
    algorithm: 'RS256',
    keyid: options.keyId || KEY_ID,
    audience: options.audience || PROJECT_ID,
    issuer: options.issuer || `https://securetoken.google.com/${PROJECT_ID}`,
    subject: options.subject || 'firebase-user-1',
    expiresIn: '1h'
  });
}

function certificateResponse(certificates, cacheControl = 'public, max-age=3600') {
  return {
    ok: true,
    headers: {
      get: (name) => name.toLowerCase() === 'cache-control' ? cacheControl : null
    },
    json: async () => certificates
  };
}

test('parseCacheTtl uses max-age and falls back safely', () => {
  assert.equal(parseCacheTtl('public, max-age=120'), 120_000);
  assert.equal(parseCacheTtl('no-cache'), 300_000);
});

test('accepts a valid verified Google Firebase ID token and caches certificates', async () => {
  let fetchCount = 0;
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    requiredSignInProvider: 'google.com',
    fetchImpl: async () => {
      fetchCount += 1;
      return certificateResponse({ [KEY_ID]: publicKeyPem });
    }
  });

  const token = signFirebaseToken();
  const firstClaims = await verifier.verifyIdToken(token);
  const secondClaims = await verifier.verifyIdToken(token);

  assert.equal(firstClaims.sub, 'firebase-user-1');
  assert.equal(firstClaims.email, 'person@example.com');
  assert.equal(secondClaims.firebase.sign_in_provider, 'google.com');
  assert.equal(fetchCount, 1);
});

test('refreshes certificates once when a token uses a new key id', async () => {
  let fetchCount = 0;
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    fetchImpl: async () => {
      fetchCount += 1;
      return fetchCount === 1
        ? certificateResponse({ oldKey: publicKeyPem })
        : certificateResponse({ [KEY_ID]: publicKeyPem });
    }
  });

  const claims = await verifier.verifyIdToken(signFirebaseToken());

  assert.equal(claims.sub, 'firebase-user-1');
  assert.equal(fetchCount, 2);
});

test('rate limits certificate refreshes for repeated unknown key ids', async () => {
  let fetchCount = 0;
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    fetchImpl: async () => {
      fetchCount += 1;
      return certificateResponse({ knownKey: publicKeyPem });
    }
  });
  const unknownKeyToken = signFirebaseToken({}, { keyId: 'unknown-key' });

  await assert.rejects(verifier.verifyIdToken(unknownKeyToken), {
    code: 'INVALID_FIREBASE_TOKEN'
  });
  await assert.rejects(verifier.verifyIdToken(unknownKeyToken), {
    code: 'INVALID_FIREBASE_TOKEN'
  });

  assert.equal(fetchCount, 2);
});

test('rejects a token issued for a different Firebase project', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    fetchImpl: async () => certificateResponse({ [KEY_ID]: publicKeyPem })
  });

  await assert.rejects(
    verifier.verifyIdToken(signFirebaseToken({}, { audience: 'another-project' })),
    { code: 'INVALID_FIREBASE_TOKEN', statusCode: 401 }
  );
});

test('rejects a Firebase identity whose email is not verified', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    fetchImpl: async () => certificateResponse({ [KEY_ID]: publicKeyPem })
  });

  await assert.rejects(
    verifier.verifyIdToken(signFirebaseToken({ email_verified: false })),
    { code: 'INVALID_FIREBASE_TOKEN', statusCode: 401 }
  );
});

test('rejects a verified Firebase token from a non-Google provider', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    requiredSignInProvider: 'google.com',
    fetchImpl: async () => certificateResponse({ [KEY_ID]: publicKeyPem })
  });

  await assert.rejects(
    verifier.verifyIdToken(
      signFirebaseToken({ firebase: { sign_in_provider: 'password' } })
    ),
    { code: 'INVALID_FIREBASE_TOKEN', statusCode: 401 }
  );
});

test('fails closed when Firebase authentication is not configured', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: '',
    now: () => NOW_MS,
    fetchImpl: async () => certificateResponse({ [KEY_ID]: publicKeyPem })
  });

  await assert.rejects(
    verifier.verifyIdToken(signFirebaseToken()),
    { code: 'FIREBASE_AUTH_NOT_CONFIGURED', statusCode: 503 }
  );
});

test('reports certificate outages as a temporary service failure', async () => {
  const verifier = createFirebaseTokenVerifier({
    projectId: PROJECT_ID,
    now: () => NOW_MS,
    fetchImpl: async () => ({ ok: false, status: 503 })
  });

  await assert.rejects(
    verifier.verifyIdToken(signFirebaseToken()),
    { code: 'FIREBASE_CERTS_UNAVAILABLE', statusCode: 503 }
  );
});
