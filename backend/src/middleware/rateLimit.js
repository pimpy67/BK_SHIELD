const db = require('../config/db');

function createRateLimiter(endpoint, limitEnvKey, defaultLimit = 10) {
  return async function rateLimitMiddleware(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = parseInt(process.env[limitEnvKey]) || defaultLimit;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    try {
      const record = await db('rate_limits')
        .where({ key, endpoint })
        .where('window_start', '>=', windowStart)
        .first();

      if (record) {
        if (record.request_count >= limit) {
          return res.status(429).json({
            error_code: 'RATE_LIMIT_EXCEEDED',
            message: `Troppi tentativi su ${endpoint}. Riprova tra un'ora.`,
            timestamp: now.toISOString(),
            request_id: req.requestId,
          });
        }
        await db('rate_limits').where({ id: record.id }).increment('request_count', 1);
      } else {
        await db('rate_limits').where({ key, endpoint }).where('window_start', '<', windowStart).delete();
        await db('rate_limits').insert({
          key,
          endpoint,
          request_count: 1,
          window_start: now.toISOString(),
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { createRateLimiter };
