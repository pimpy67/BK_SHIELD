const express = require('express');
const router = express.Router();
const { login, refresh } = require('../../controllers/vendorAuthController');
const { createRateLimiter } = require('../../middleware/rateLimit');

const vendorLoginRateLimit = createRateLimiter('vendor_login', 'RATE_LIMIT_VENDOR_LOGIN_PER_HOUR', 10);

// F1 — autenticazione con API key
router.post('/auth/login', vendorLoginRateLimit, login);

// F2 — rinnovo access token
router.post('/token/refresh', refresh);

module.exports = router;
