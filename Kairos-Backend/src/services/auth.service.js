const jwt = require('jsonwebtoken');
const { createFirebaseTokenVerifier } = require('../../firebase-token-verifier');
const { createGoogleAuthHandler } = require('../../google-auth-handler');

function createAuthService({ db, config }) {
  const firebaseTokenVerifier = createFirebaseTokenVerifier({
    projectId: config.firebaseProjectId,
    certsUrl: config.firebaseCertsUrl,
    requiredSignInProvider: 'google.com'
  });

  function createAuthResponse(user) {
    const publicUser = { id: user.id || user._id, email: user.email, name: user.name || '' };
    return {
      token: jwt.sign({ userId: publicUser.id, email: publicUser.email, name: publicUser.name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn || '1h' }),
      user: publicUser
    };
  }

  return {
    createAuthResponse,
    googleAuthHandler: createGoogleAuthHandler({ db, firebaseTokenVerifier, createAuthResponse })
  };
}

module.exports = { createAuthService };
