const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const env = require('../config/env');

let privateKey = null;
let publicKey = null;

function loadKeys() {
  if (!privateKey) privateKey = fs.readFileSync(env.jwt.privateKeyPath);
  if (!publicKey) publicKey = fs.readFileSync(env.jwt.publicKeyPath);
}

function signAccessToken(payload) {
  loadKeys();
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: env.jwt.ttlSeconds,
  });
}

function verifyAccessToken(token) {
  loadKeys();
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
