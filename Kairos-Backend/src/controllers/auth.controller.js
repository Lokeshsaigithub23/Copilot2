const bcrypt = require('bcryptjs');

function createAuthController({ db, authService,emailVerificationService }) {
  const failedLogins = new Map();
  const maxAttempts = 5;
  const windowMs = 15 * 60 * 1000;

  function getLoginKey(req, email) {
    return `${req.ip || 'unknown'}:${String(email || '').trim().toLowerCase()}`;
  }

  function isRateLimited(key) {
    const now = Date.now();
    const record = failedLogins.get(key);

    if (!record || now - record.firstAttempt >= windowMs) {
      failedLogins.delete(key);
      return false;
    }

    return record.attempts >= maxAttempts;
  }

  function recordFailedLogin(key) {
    const now = Date.now();
    const record = failedLogins.get(key);

    if (!record || now - record.firstAttempt >= windowMs) {
      failedLogins.set(key, {
        attempts: 1,
        firstAttempt: now
      });
    } else {
      record.attempts += 1;
    }
  }

  function clearFailedLogins(key) {
    failedLogins.delete(key);
  }

  return {
    register: async (req, res) => {
      try {
        const {
          email,
          password,
          name,
          referralCode
        } = req.body || {};

        if (!email || !password) {
          return res.status(400).json({
            error: {
              message: 'Email and password are required.'
            }
          });
        }

        if (await db.getUserByEmail(email)) {
          return res.status(400).json({
            error: {
              message: 'Email is already registered.'
            }
          });
        }

        const user = await db.createUser(
          email,
          password,
          name,
          referralCode,
          req.ip || ''
        );

        let verificationEmailSent = false;

        try {
          await emailVerificationService.createVerificationToken(user);
          verificationEmailSent = true;
        } catch (emailError) {
          console.error('Verification email could not be sent:', emailError.message);
        }

        return res.status(201).json({
          message: verificationEmailSent
            ? 'User registered successfully. Please verify your email.'
            : 'User registered successfully. Email verification is currently unavailable.',
          user
        });
      } catch (err) {
        console.error('Registration error:', err);
        console.error('Registration error message:', err?.message);
        console.error('Registration error code:', err?.code);
        console.error('Registration error meta:', err?.meta);
        console.error('Registration error stack:', err?.stack);

        if (err.message === 'Invalid referral code') {
          return res.status(400).json({
            error: {
              message: 'Invalid referral code.'
            }
          });
        }

        res.status(500).json({
          error: {
            message: 'Internal server error.'
          }
        });
      }
    },

    login: async (req, res) => {
      const { email, password } = req.body || {};
      const loginKey = getLoginKey(req, email);

      if (isRateLimited(loginKey)) {
        return res.status(429).json({
          error: {
            message: 'Too many login attempts. Please try again later.'
          }
        });
      }

      try {
        if (!email || !password) {
          return res.status(400).json({
            error: {
              message: 'Email and password are required.'
            }
          });
        }

        const user = await db.getUserByEmail(email);

        if (!user || !(await bcrypt.compare(password, user.password))) {
          recordFailedLogin(loginKey);

          return res.status(401).json({
            error: {
              message: 'Invalid email or password.'
            }
          });
        }
        if (!user.emailVerified) {
          return res.status(403).json({
            error: {
              message: 'Please verify your email before logging in.'
            }
          });
        }

        clearFailedLogins(loginKey);

        res.json(authService.createAuthResponse(user));
      } catch (err) {
        console.error('Login error:', err.message);

        res.status(500).json({
          error: {
            message: 'Internal server error during authentication.'
          }
        });
      }
    },

    verifyEmail: async (req, res) => {
      try {
        const { token } = req.query;

        const result =
          await emailVerificationService.verifyEmail(token);

        if (!result.success) {
          const messages = {
            missing_token: 'Verification token is required.',
            invalid_token: 'Invalid verification token.',
            token_already_used: 'This verification link has already been used.',
            token_expired: 'This verification link has expired.'
          };

          return res.status(400).json({
            error: {
              message:
                messages[result.reason] ||
                'Email verification failed.'
            }
          });
        }

        return res.json({
          message: 'Email verified successfully. You can now log in.'
        });
      } catch (err) {
        console.error('Email verification error:', err);

        return res.status(500).json({
          error: {
            message: 'Internal server error during email verification.'
          }
        });
      }
    },

    google: authService.googleAuthHandler
  };
}

module.exports = { createAuthController };