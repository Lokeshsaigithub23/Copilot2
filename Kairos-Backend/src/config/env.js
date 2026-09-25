const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../..', 'backend/.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'backend/.env')
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, override: true });
    break;
  }
}

const uploadDirectory = path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.');
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET is missing; using an ephemeral local dev secret for this process.');
}

// Comma-separated list of browser origins allowed to call this API.
// Previously the app ran cors() with no options, which answers every origin
// with `access-control-allow-origin: *` -- any site could call the API with a
// user's credentials. Production must name its origins explicitly.
const configuredCorsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const localCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
];

const corsOrigins = process.env.NODE_ENV === 'production'
  ? configuredCorsOrigins
  : [...new Set([...configuredCorsOrigins, ...localCorsOrigins])];

if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production (comma-separated list of allowed origins).');
}

const publicApiBaseUrl = String(process.env.PUBLIC_API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, '');
if (process.env.NODE_ENV === 'production' && !publicApiBaseUrl.startsWith('https://')) {
  throw new Error('PUBLIC_API_BASE_URL must use HTTPS in production.');
}

const config = {
  port: Number(process.env.PORT || 4000),

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',

  publicApiBaseUrl,
  uploadDirectory,
  corsOrigins,

  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseCertsUrl: process.env.FIREBASE_CERTS_URL,

  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
    verificationUrl:
      process.env.EMAIL_VERIFICATION_URL ||
      'http://localhost:4000/api/auth/verify-email'
  },

  s3: {
    enabled: process.env.SAVE_IN_S3 === 'true',
    bucket: process.env.AWS_S3_BUCKET || '',
    region: process.env.AWS_S3_REGION || 'ap-south-1'
  }
};

module.exports = { config };
