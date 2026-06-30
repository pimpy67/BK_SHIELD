const { verifyAccessToken } = require('../services/tokenService');

async function clientAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error_code: 'CLIENT_AUTH_MISSING_TOKEN',
      message: 'Token di autenticazione mancante.',
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
    });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'client') {
      return res.status(401).json({
        error_code: 'CLIENT_AUTH_INVALID_TYPE',
        message: 'Token non valido per endpoint client.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }
    req.clientId = payload.sub;
    next();
  } catch {
    return res.status(401).json({
      error_code: 'CLIENT_AUTH_EXPIRED_TOKEN',
      message: 'Token scaduto o non valido.',
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
    });
  }
}

module.exports = clientAuth;
