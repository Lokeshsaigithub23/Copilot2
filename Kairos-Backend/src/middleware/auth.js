const jwt = require('jsonwebtoken');

function createAuthenticateToken(jwtSecret) {
  return function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: { message: 'Access denied. Token missing.' } });

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        console.warn('JWT verification failed:', err.message);
        return res.status(401).json({ error: { message: 'Session expired or invalid token. Please login again.', code: 'UNAUTHORIZED' } });
      }
      req.user = {
        ...user,
        id: user.userId || user.id,
        userId: user.userId || user.id
      };
      next();
    });
  };
}

function verifyWebSocketToken(token, jwtSecret) {
  if (!token) return null;
  try { return jwt.verify(token, jwtSecret); } catch (_) { return null; }
}

module.exports = { createAuthenticateToken, verifyWebSocketToken };