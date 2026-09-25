const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const { findAvailablePort } = require('../src/config/port');

test('findAvailablePort skips an occupied port and returns the next free one', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const occupiedPort = server.address().port;
  const nextPort = await findAvailablePort(occupiedPort, '127.0.0.1');

  assert.notEqual(nextPort, occupiedPort);

  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(nextPort, '127.0.0.1', resolve));
  await new Promise((resolve) => probe.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});
