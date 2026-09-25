const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const { ensurePrismaEnv } = require('./prisma-env');

ensurePrismaEnv();
process.env.XDG_CACHE_HOME ||= path.join(os.tmpdir(), 'copilotiq-prisma-cache');
process.env.CHECKPOINT_DISABLE ||= '1';
process.env.PRISMA_HIDE_UPDATE_MESSAGE ||= '1';

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  env: process.env,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
