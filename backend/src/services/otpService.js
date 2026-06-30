const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

async function isLockedOut(clientId) {
  const windowStart = new Date(Date.now() - env.otp.lockoutMinutes * 60 * 1000).toISOString();
  const attempts = await db('otp_attempts')
    .where({ client_id: clientId })
    .where('attempted_at', '>=', windowStart)
    .count('id as cnt')
    .first();
  return parseInt(attempts.cnt) >= env.otp.maxAttempts;
}

async function recordFailedAttempt(clientId) {
  await db('otp_attempts').insert({
    client_id: clientId,
    attempted_at: new Date().toISOString(),
  });
}

async function createOtp(clientId, type = 'registration') {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + env.otp.ttlMinutes * 60 * 1000).toISOString();

  // invalida OTP precedenti dello stesso tipo
  await db('otp_codes')
    .where({ client_id: clientId, type })
    .whereNull('used_at')
    .update({ used_at: new Date().toISOString() });

  await db('otp_codes').insert({
    client_id: clientId,
    type,
    code_hash: hashOtp(otp),
    expires_at: expiresAt,
  });

  return { otp, expiresAt };
}

async function verifyOtp(clientId, providedOtp, type = 'registration') {
  const now = new Date().toISOString();
  const record = await db('otp_codes')
    .where({ client_id: clientId, type, code_hash: hashOtp(providedOtp) })
    .whereNull('used_at')
    .where('expires_at', '>', now)
    .first();

  if (!record) return { valid: false };

  await db('otp_codes').where({ id: record.id }).update({ used_at: now });
  return { valid: true };
}

module.exports = { generateOtp, hashOtp, isLockedOut, recordFailedAttempt, createOtp, verifyOtp };
