const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/app');

test('allows the local Vite origin to preflight session and InterviewPanel requests', async (t) => {
  const app = createApp({
    db: { ready: Promise.resolve() },
    config: {
      jwtSecret: 'test-secret',
      corsOrigins: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
      ],
      uploadDirectory: require('node:path').join(__dirname, '..', 'uploads')
    }
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  const headers = {
    Origin: 'http://127.0.0.1:3001',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
    Connection: 'close'
  };

  for (const route of ['/api/sessions', '/api/interview-panel/upload-resume']) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: 'OPTIONS',
      headers
    });
    assert.ok(response.status >= 200 && response.status < 300);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3001');
    assert.match(response.headers.get('access-control-allow-headers') || '', /authorization/i);
  }
});
