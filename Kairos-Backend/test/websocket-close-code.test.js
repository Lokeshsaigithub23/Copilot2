const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeCloseCode } = require('../src/websocket/gateway');

test('normalizes invalid provider close codes before forwarding them', () => {
  assert.equal(normalizeCloseCode(undefined), 1000);
  assert.equal(normalizeCloseCode(1005), 1000);
  assert.equal(normalizeCloseCode(1006), 1000);
  assert.equal(normalizeCloseCode(1001), 1001);
  assert.equal(normalizeCloseCode(4000), 4000);
});
