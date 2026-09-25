const http = require('http');
const { config } = require('./src/config/env');
const { findAvailablePort } = require('./src/config/port');
const db = require('./src/models/database');
const { createApp } = require('./src/app');
const { attachWebSocketGateway } = require('./src/websocket/gateway');

const app = createApp({ db, config });
const httpServer = http.createServer(app);
attachWebSocketGateway(httpServer, config);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

async function startServer() {
  const preferredPort = Number(process.env.PORT || config.port || 4000);
  const host = process.env.HOST || '0.0.0.0';

  try {
    // ECS/Fargate binds the task definition's port mapping and health check to
    // a fixed port -- silently shifting off it here would break the ALB target
    // with no visible error, so only auto-shift outside production.
    const resolvedPort = process.env.NODE_ENV === 'production'
      ? preferredPort
      : await findAvailablePort(preferredPort, host);
    if (resolvedPort !== preferredPort) {
      console.warn(`[startup] Port ${preferredPort} is in use; using ${resolvedPort} instead.`);
    }

    config.port = resolvedPort;
    process.env.PORT = String(resolvedPort);

    httpServer.listen(resolvedPort, host, () => {
      console.log('==========================================');
      console.log(' Copilot Backend Server is online!');
      console.log(` Port: ${resolvedPort}`);
      console.log(` API URL: http://localhost:${resolvedPort}`);
      console.log(` WS  URL: ws://localhost:${resolvedPort}/api/transcribe/live`);
      console.log(' Database: PostgreSQL via Prisma');
      console.log('==========================================');
    });
  } catch (err) {
    console.error('Failed to start backend:', err.message);
    process.exit(1);
  }
}

db.ready
  .then(() => startServer())
  .catch((err) => {
    console.error('Failed to start backend:', err.message);
    process.exit(1);
  });

module.exports = { app, httpServer };
