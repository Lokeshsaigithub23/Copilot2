const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '../.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function defaultDatabaseUrl() {
  const dataDir = path.resolve(__dirname, '../data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'dev.db');

  return `file:${dbPath}`;
}

function ensurePrismaEnv() {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production.');
    }

    process.env.DATABASE_URL = defaultDatabaseUrl();
  } else {
    const url = process.env.DATABASE_URL;

    if (url.startsWith('file:')) {
      const filePath = path.resolve(
        __dirname,
        '..',
        url.replace(/^file:/, '')
      );

      const parentDir = path.dirname(filePath);

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }
  }

  return process.env.DATABASE_URL;
}

module.exports = {
  defaultDatabaseUrl,
  ensurePrismaEnv
};