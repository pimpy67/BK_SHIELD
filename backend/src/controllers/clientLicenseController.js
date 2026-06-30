const db = require('../config/db');
const env = require('../config/env');
const { signAccessToken, generateRefreshToken, hashToken } = require('../services/tokenService');

// C4 GET /api/client/license/status
async function licenseStatus(req, res, next) {
  try {
    const client = await db('clients').where({ id: req.clientId }).first();
    if (!client) {
      return res.status(404).json({
        error_code: 'CLIENT_NOT_FOUND',
        message: 'Cliente non trovato.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    if (client.registration_status === 'suspended') {
      return res.status(403).json({
        error_code: 'CLIENT_SUSPENDED',
        message: 'Account sospeso. Contatta il supporto.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const license = await db('licenses')
      .where({ client_id: client.id })
      .whereIn('status', ['active', 'expired', 'revoked'])
      .orderBy('created_at', 'desc')
      .first();

    if (!license) {
      return res.status(404).json({
        error_code: 'LICENSE_NOT_FOUND',
        message: 'Nessuna licenza trovata per questo cliente.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Aggiorna last_seen_at
    await db('clients').where({ id: client.id }).update({ last_seen_at: new Date().toISOString() });

    // Conta messaggi non letti
    const unread = await db('messages')
      .where({ client_id: client.id })
      .whereNull('read_at')
      .where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', new Date().toISOString()))
      .count('id as cnt')
      .first();

    const modules = await db('license_modules')
      .join('modules', 'license_modules.module_id', 'modules.id')
      .where({ 'license_modules.license_id': license.id, 'license_modules.enabled': 1 })
      .pluck('modules.code');

    const setup = await db('vendor_general_setup').first();
    const checkIntervalHours = setup?.default_check_interval_hours ?? 24;

    // Refresh offline_token ad ogni check (aggiorna lo stato corrente)
    const { encrypt } = require('../services/cryptoService');
    const offlinePayload = JSON.stringify({
      license_key: license.license_key,
      type: license.type,
      status: license.status,
      end_date: license.end_date,
      modules,
    });
    const offlineToken = encrypt(offlinePayload, env.crypto.aesKey);
    await db('clients').where({ id: client.id }).update({ offline_token: offlineToken });

    return res.status(200).json({
      license_key: license.license_key,
      type: license.type,
      status: license.status,
      start_date: license.start_date,
      end_date: license.end_date,
      offline_token: offlineToken,
      modules,
      check_interval_hours: checkIntervalHours,
      messages_pending: parseInt(unread.cnt),
    });
  } catch (err) {
    next(err);
  }
}

// C5 GET /api/client/messages
async function getMessages(req, res, next) {
  try {
    const now = new Date().toISOString();
    const messages = await db('messages')
      .where({ client_id: req.clientId })
      .whereNull('read_at')
      .where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', now))
      .orderBy('created_at', 'desc')
      .select('id', 'content', 'type', 'created_at');

    // Marca come letti
    if (messages.length > 0) {
      const ids = messages.map((m) => m.id);
      await db('messages').whereIn('id', ids).update({ read_at: now });
    }

    return res.status(200).json({ messages });
  } catch (err) {
    next(err);
  }
}

// C6 POST /api/client/token/refresh
async function refreshToken(req, res, next) {
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
    const record = await db('client_tokens')
      .where({ token_hash: hashToken(refresh_token) })
      .whereNull('revoked_at')
      .where('expires_at', '>', now)
      .first();

    if (!record) {
      return res.status(401).json({
        error_code: 'CLIENT_REFRESH_INVALID',
        message: 'Refresh token non valido o scaduto.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Rotation
    await db('client_tokens').where({ id: record.id }).update({ revoked_at: now });

    const newAccessToken = signAccessToken({ sub: record.client_id, type: 'client' });
    const newRefreshToken = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + env.jwt.refreshTtlSeconds * 1000).toISOString();

    await db('client_tokens').insert({
      client_id: record.client_id,
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

module.exports = { licenseStatus, getMessages, refreshToken };
