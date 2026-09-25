const net = require('node:net');

async function isPortAvailable(port, host = '127.0.0.1') {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function findAvailablePort(startPort, host = '127.0.0.1', maxAttempts = 20) {
  const port = Number(startPort) || 4000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = port + attempt;
    if (await isPortAvailable(candidate, host)) {
      return candidate;
    }
  }

  throw new Error(`No free port found starting from ${port} (checked ${maxAttempts} ports).`);
}

module.exports = { isPortAvailable, findAvailablePort };
