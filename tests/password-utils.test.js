'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { verifyPassword } = require('../password-utils');

test('verifies bcrypt hashes', async () => {
  const hash = await bcrypt.hash('demo-password-123', 4);
  assert.equal(await verifyPassword('demo-password-123', hash, false), true);
  assert.equal(await verifyPassword('incorrect-password', hash, false), false);
});

test('allows plaintext only when explicitly enabled', async () => {
  assert.equal(await verifyPassword('demo-password-123', 'demo-password-123', true), true);
  assert.equal(await verifyPassword('incorrect-password', 'demo-password-123', true), false);
  assert.equal(await verifyPassword('demo-password-123', 'demo-password-123', false), false);
});

test('rejects empty stored passwords', async () => {
  assert.equal(await verifyPassword('anything', '', true), false);
});
