const { v4: uuidv4 } = require('uuid');

function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
      error_code: err.errorCode || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Errore interno del server',
      details: err.details || null,
      timestamp: new Date().toISOString(),
      request_id: req.requestId || uuidv4(),
    });
}

function notFound(req, res, next) {
    const err = new Error(`Endpoint non trovato: ${req.method} ${req.path}`);
    err.statusCode = 404;
    err.errorCode = 'ENDPOINT_NOT_FOUND';
    next(err);
}

module.exports = { errorHandler, notFound };