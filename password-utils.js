'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function verifyPassword(password, stored, allowPlaintext) {
  if (typeof stored !== 'string' || !stored) return false;
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) return bcrypt.compare(String(password ?? ''), stored);
  if (!allowPlaintext) return false;

  const provided = Buffer.from(String(password ?? ''));
  const expected = Buffer.from(stored);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

module.exports = { verifyPassword };
