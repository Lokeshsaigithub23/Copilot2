const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ensurePrismaEnv } = require('./prisma-env');

const databaseUrl = ensurePrismaEnv();

fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
process.env.XDG_CACHE_HOME ||= path.join(os.tmpdir(), 'copilotiq-prisma-cache');
process.env.CHECKPOINT_DISABLE ||= '1';
process.env.PRISMA_HIDE_UPDATE_MESSAGE ||= '1';

const prismaCli = require.resolve('prisma/build/index.js');

function runPrisma(args, options = {}) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding
  });
}

function sqliteFilePath() {
  const url = process.env.DATABASE_URL || '';

  if (!url.startsWith('file:')) {
    return null;
  }

  const rawPath = url.slice('file:'.length);

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(__dirname, '..', 'prisma', rawPath);
}

function generateClient() {
  const generate = runPrisma(['generate']);
  return generate.status === 0;
}

function sqliteHasSchema(dbPath) {
  const check = spawnSync('sqlite3', [
    dbPath,
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('User', 'Session', 'Role', 'Skill');"
  ], {
    encoding: 'utf8'
  });

  return (
    check.status === 0 &&
    Number(String(check.stdout || '').trim()) >= 4
  );
}

function fallbackCreateSqliteDatabase() {
  const dbPath = sqliteFilePath();

  if (!dbPath) {
    return false;
  }

  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    if (sqliteHasSchema(dbPath)) {
      console.warn(
        '[db] Existing SQLite schema detected; regenerating Prisma Client.'
      );

      return generateClient();
    }

    console.error(
      '[db] Prisma db push failed and the SQLite database already exists.'
    );
    console.error(
      '[db] Refusing to overwrite it. Delete the local dev database and retry if you want a fresh DB.'
    );

    return false;
  }

  const diff = runPrisma([
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script'
  ], {
    stdio: 'pipe',
    encoding: 'utf8'
  });

  if (diff.status !== 0 || !diff.stdout) {
    process.stderr.write(diff.stderr || '');
    return false;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = spawnSync('sqlite3', [dbPath], {
    input: diff.stdout,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8'
  });

  if (sqlite.status !== 0) {
    return false;
  }

  return generateClient();
}

/*
 * Neon/PostgreSQL:
 * The database is managed through Prisma migrations.
 * Do NOT run `prisma db push` automatically.
 */
if (
  databaseUrl.startsWith('postgresql://') ||
  databaseUrl.startsWith('postgres://')
) {
  console.log('[db] PostgreSQL detected; skipping automatic db push.');
  process.exit(0);
}

/*
 * Local SQLite development:
 * Keep the existing automatic schema setup for file: databases.
 */
if (databaseUrl.startsWith('file:')) {
  const result = runPrisma(['db', 'push']);

  if (result.status === 0) {
    process.exit(0);
  }

  console.warn(
    '[db] Prisma db push failed; trying direct SQLite schema fallback for local development.'
  );

  if (fallbackCreateSqliteDatabase()) {
    process.exit(0);
  }

  process.exit(result.status ?? 1);
}

console.warn(
  '[db] Unknown DATABASE_URL protocol; skipping automatic database schema changes.'
);

process.exit(0);