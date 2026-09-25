// Regression tests for cross-user data exposure in db.js.
//
// These need a real PostgreSQL database because the Prisma schema targets
// postgres. CI provides one as a service container; locally, set
// TEST_DATABASE_URL to a throwaway database and the suite will run.
// Without it the suite skips rather than failing, so `npm test` stays usable
// with no database present.

const test = require('node:test');
const assert = require('node:assert');

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  test('session isolation (skipped: TEST_DATABASE_URL not set)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.NODE_ENV = 'production'; // suppress the dev-only schema push

  const db = require('../db');

  const unique = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  test('session isolation', async (t) => {
    await db.ready;

    const alice = await db.createUser(`alice_${unique()}@example.com`, 'pw-alice-12345', 'Alice');
    const bob = await db.createUser(`bob_${unique()}@example.com`, 'pw-bob-12345', 'Bob');

    const aliceSession = await db.createSession(
      { tech: 'Interview', title: "Alice's private interview" },
      alice.id
    );

    await t.test('a user with no sessions of their own gets an empty list, not everyone else\'s', async () => {
      const bobSessions = await db.getSessionsByUser(bob.id);
      assert.deepStrictEqual(bobSessions, [], 'Bob must not see any sessions');
    });

    await t.test('a user sees only their own sessions', async () => {
      const aliceSessions = await db.getSessionsByUser(alice.id);
      assert.strictEqual(aliceSessions.length, 1);
      assert.strictEqual(aliceSessions[0].id, aliceSession.id);
      assert.strictEqual(aliceSessions[0].userId, alice.id);
    });

    await t.test('listing sessions without a user id is refused', async () => {
      await assert.rejects(() => db.getSessionsByUser(undefined), /userId is required/);
    });

    await t.test('a session cannot be created for an unknown user', async () => {
      await assert.rejects(
        () => db.createSession({ title: 'orphan' }, 'no-such-user-id'),
        /Session owner does not exist/,
        'must not silently reassign the session to some other user'
      );
    });

    await t.test('a session cannot be created without a user id', async () => {
      await assert.rejects(() => db.createSession({ title: 'orphan' }, null), /userId is required/);
    });

    await t.test('a session created for one user is never filed under another', async () => {
      const before = await db.getSessionsByUser(bob.id);
      await db.createSession({ title: "Alice's second" }, alice.id);
      const after = await db.getSessionsByUser(bob.id);
      assert.strictEqual(after.length, before.length, "Bob's list must not grow");
    });

    await t.test('audio cannot be attached to another user\'s session', async () => {
      await assert.rejects(
        () => db.updateSessionAudio(aliceSession.id, 'uploads/evil.webm', bob.id),
        /Session not found/,
        'Bob must not be able to overwrite the audio on Alice\'s session'
      );

      const [stillAlice] = await db.getSessionsByUser(alice.id);
      const target = (await db.getSessionsByUser(alice.id)).find((s) => s.id === aliceSession.id);
      assert.ok(stillAlice, 'Alice still has her sessions');
      assert.strictEqual(target.audioFilePath, null, "Alice's audio path is untouched");
    });

    await t.test('a user can attach audio to their own session', async () => {
      const updated = await db.updateSessionAudio(aliceSession.id, 'uploads/alice.webm', alice.id);
      assert.strictEqual(updated.audioFilePath, 'uploads/alice.webm');
    });
  });
}
