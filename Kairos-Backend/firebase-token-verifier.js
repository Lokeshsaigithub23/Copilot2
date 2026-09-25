const jwt = require('jsonwebtoken');

const DEFAULT_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const UNKNOWN_KEY_REFRESH_INTERVAL_MS = 60 * 1000;
const MAX_TOKEN_LENGTH = 16 * 1024;

class FirebaseTokenError extends Error {
  constructor(code, message, statusCode = 401) {
    super(message);
    this.name = 'FirebaseTokenError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parseCacheTtl(cacheControl) {
  const match = String(cacheControl || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  if (!match) return DEFAULT_CACHE_TTL_MS;

  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_CACHE_TTL_MS;
}

function createFirebaseTokenVerifier(options = {}) {
  const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID;
  const certsUrl =
    options.certsUrl || process.env.FIREBASE_CERTS_URL || DEFAULT_CERTS_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const requiredSignInProvider = options.requiredSignInProvider || null;

  let cachedCertificates = null;
  let certificatesExpireAt = 0;
  let pendingCertificateRequest = null;
  let lastUnknownKeyRefreshAt = 0;

  async function fetchCertificates(forceRefresh = false) {
    if (
      !forceRefresh &&
      cachedCertificates &&
      now() < certificatesExpireAt
    ) {
      return cachedCertificates;
    }

    if (pendingCertificateRequest) {
      return pendingCertificateRequest;
    }

    if (typeof fetchImpl !== 'function') {
      throw new FirebaseTokenError(
        'FIREBASE_CERTS_UNAVAILABLE',
        'Firebase certificate retrieval is unavailable.',
        503
      );
    }

    pendingCertificateRequest = (async () => {
      let response;
      try {
        response = await fetchImpl(certsUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });
      } catch (_) {
        throw new FirebaseTokenError(
          'FIREBASE_CERTS_UNAVAILABLE',
          'Firebase certificates could not be retrieved.',
          503
        );
      }

      if (!response.ok) {
        throw new FirebaseTokenError(
          'FIREBASE_CERTS_UNAVAILABLE',
          'Firebase certificates could not be retrieved.',
          503
        );
      }

      let certificates;
      try {
        certificates = await response.json();
      } catch (_) {
        throw new FirebaseTokenError(
          'FIREBASE_CERTS_UNAVAILABLE',
          'Firebase returned an invalid certificate response.',
          503
        );
      }
      const isValidCertificateMap =
        certificates &&
        typeof certificates === 'object' &&
        !Array.isArray(certificates) &&
        Object.values(certificates).every((value) => typeof value === 'string');

      if (!isValidCertificateMap || Object.keys(certificates).length === 0) {
        throw new FirebaseTokenError(
          'FIREBASE_CERTS_UNAVAILABLE',
          'Firebase returned an invalid certificate set.',
          503
        );
      }

      cachedCertificates = certificates;
      certificatesExpireAt =
        now() + parseCacheTtl(response.headers?.get?.('cache-control'));
      return certificates;
    })().finally(() => {
      pendingCertificateRequest = null;
    });

    return pendingCertificateRequest;
  }

  async function verifyIdToken(idToken) {
    if (!projectId) {
      throw new FirebaseTokenError(
        'FIREBASE_AUTH_NOT_CONFIGURED',
        'Firebase authentication is not configured.',
        503
      );
    }

    if (
      typeof idToken !== 'string' ||
      idToken.length === 0 ||
      idToken.length > MAX_TOKEN_LENGTH
    ) {
      throw new FirebaseTokenError(
        'INVALID_FIREBASE_TOKEN',
        'Firebase ID token is invalid.'
      );
    }

    const decoded = jwt.decode(idToken, { complete: true });
    const algorithm = decoded?.header?.alg;
    const keyId = decoded?.header?.kid;

    if (algorithm !== 'RS256' || typeof keyId !== 'string' || !keyId) {
      throw new FirebaseTokenError(
        'INVALID_FIREBASE_TOKEN',
        'Firebase ID token header is invalid.'
      );
    }

    let certificates = await fetchCertificates(false);
    let certificate = certificates[keyId];

    if (
      !certificate &&
      now() - lastUnknownKeyRefreshAt >= UNKNOWN_KEY_REFRESH_INTERVAL_MS
    ) {
      lastUnknownKeyRefreshAt = now();
      certificates = await fetchCertificates(true);
      certificate = certificates[keyId];
    }

    if (!certificate) {
      throw new FirebaseTokenError(
        'INVALID_FIREBASE_TOKEN',
        'Firebase ID token signing key is unknown.'
      );
    }

    let claims;
    try {
      claims = jwt.verify(idToken, certificate, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        clockTimestamp: Math.floor(now() / 1000)
      });
    } catch (_) {
      throw new FirebaseTokenError(
        'INVALID_FIREBASE_TOKEN',
        'Firebase ID token verification failed.'
      );
    }

    const currentTime = Math.floor(now() / 1000);
    const subjectIsValid =
      typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 128;
    const issuedAtIsValid =
      Number.isFinite(claims.iat) && claims.iat <= currentTime;
    const authTimeIsValid =
      Number.isFinite(claims.auth_time) && claims.auth_time <= currentTime;
    const emailIsVerified =
      typeof claims.email === 'string' &&
      claims.email.trim().length > 0 &&
      claims.email_verified === true;
    const providerIsValid =
      !requiredSignInProvider ||
      claims.firebase?.sign_in_provider === requiredSignInProvider;

    if (
      !subjectIsValid ||
      !issuedAtIsValid ||
      !authTimeIsValid ||
      !emailIsVerified ||
      !providerIsValid
    ) {
      throw new FirebaseTokenError(
        'INVALID_FIREBASE_TOKEN',
        'Firebase ID token claims are invalid.'
      );
    }

    return claims;
  }

  return { verifyIdToken };
}

module.exports = {
  DEFAULT_CERTS_URL,
  FirebaseTokenError,
  createFirebaseTokenVerifier,
  parseCacheTtl
};
