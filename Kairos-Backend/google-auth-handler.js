const crypto = require('crypto');
const { FirebaseTokenError } = require('./firebase-token-verifier');

function createGoogleAuthHandler(options) {
  const {
    db,
    firebaseTokenVerifier,
    createAuthResponse,
    logger = console,
    generatePassword = () => crypto.randomBytes(48).toString('base64url')
  } = options;

  return async function googleAuthHandler(req, res) {
    try {
      const claims = await firebaseTokenVerifier.verifyIdToken(req.body?.idToken);
      const email = claims.email.trim().toLowerCase();
      let user = await db.getUserByEmail(email);

      if (!user) {
        const displayName =
          String(claims.name || '').trim() || email.split('@')[0];

        const referralCode = String(
          req.body?.referralCode || ''
        ).trim();

        const deviceId = String(
          req.body?.deviceId || ''
        ).trim();

        try {
          user = await db.createUser(
            email,
            generatePassword(),
            displayName,
            referralCode,
            req.ip || '',
            deviceId
          );
        } catch (createError) {
          // A concurrent first login may have created the same verified email.
          user = await db.getUserByEmail(email);
          if (!user) throw createError;
        }
      } else {
        const deviceId = String(
          req.body?.deviceId || ''
        ).trim();

        if (deviceId) {
          await db.bindDeviceToUser(user.id, deviceId);
        }
      }

      await db.prisma.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'GOOGLE_SIGN_IN',
          metadata: JSON.stringify({
            provider: 'google.com'
          })
        }
      });

      return res.json(createAuthResponse(user));
    } catch (err) {
      if (err instanceof FirebaseTokenError) {
        logger.warn(`[auth] Google sign-in rejected (${err.code}).`);
        const unavailable = err.statusCode === 503;
        return res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: unavailable
              ? 'Google sign-in is temporarily unavailable.'
              : 'Google sign-in could not be verified.'
          }
        });
      }

      logger.error('Google sign-in error:', err.message);
      return res.status(500).json({
        error: { message: 'Internal server error during Google authentication.' }
      });
    }
  };
}

module.exports = { createGoogleAuthHandler };
