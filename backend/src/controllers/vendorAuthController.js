const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signAccessToken, generateRefreshToken, hashToken } = require('../services/tokenService');
const env = require('../config/env');

// F1 POST /api/vendor/auth/login
async function login(req, res, next) {
  try {
    const { api_key } = req.body;

    if (!api_key) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'Campo api_key obbligatorio.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const vendor = await db('vendors').where({ is_active: 1 }).first();

    if (!vendor || !vendor.api_key_hash || vendor.api_key_revoked_at) {
      return res.status(401).json({
        error_code: 'VENDOR_LOGIN_INVALID',
        message: 'Credenziali non valide.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const valid = await bcrypt.compare(api_key, vendor.api_key_hash);
    if (!valid) {
      return res.status(401).json({
        error_code: 'VENDOR_LOGIN_INVALID',
        message: 'Credenziali non valide.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const accessToken = signAccessToken({ sub: vendor.id, type: 'vendor' });
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.jwt.refreshTtlSeconds * 1000).toISOString();

    await db('vendor_tokens').insert({
      vendor_id: vendor.id,
      token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
    });

    return res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: env.jwt.ttlSeconds,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// F2 POST /api/vendor/token/refresh
async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'Campo refresh_token obbligatorio.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const now = new Date().toISOString();
    const record = await db('vendor_tokens')
      .where({ token_hash: hashToken(refresh_token) })
      .whereNull('revoked_at')
      .where('expires_at', '>', now)
      .first();

    if (!record) {
      return res.status(401).json({
        error_code: 'VENDOR_REFRESH_INVALID',
        message: 'Refresh token non valido o scaduto.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Rotation: revoca il token usato e ne emette uno nuovo
    await db('vendor_tokens').where({ id: record.id }).update({ revoked_at: now });

    const newAccessToken = signAccessToken({ sub: record.vendor_id, type: 'vendor' });
    const newRefreshToken = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + env.jwt.refreshTtlSeconds * 1000).toISOString();

    await db('vendor_tokens').insert({
      vendor_id: record.vendor_id,
      token_hash: hashToken(newRefreshToken),
      expires_at: newExpiresAt,
    });

    return res.status(200).json({
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: env.jwt.ttlSeconds,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh };
