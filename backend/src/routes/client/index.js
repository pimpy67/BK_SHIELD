const express = require('express');
const router = express.Router();
const { register, verifyOtpEndpoint, resendOtp } = require('../../controllers/clientController');
const { licenseStatus, getMessages, refreshToken } = require('../../controllers/clientLicenseController');
const { createRateLimiter } = require('../../middleware/rateLimit');
const clientAuth = require('../../middleware/clientAuth');

const registerRateLimit = createRateLimiter('client_register', 'RATE_LIMIT_REGISTER_PER_HOUR', 5);
const resendOtpRateLimit = createRateLimiter('client_resend_otp', 'RATE_LIMIT_RESEND_OTP_PER_HOUR', 3);

// C1 — registrazione automatica all'installazione
router.post('/register', registerRateLimit, register);

// C2 — verifica OTP + attivazione trial (emette JWT client)
router.post('/verify-otp', verifyOtpEndpoint);

// C3 — nuovo OTP se scaduto
router.post('/resend-otp', resendOtpRateLimit, resendOtp);

// C4 — check periodico stato licenza (richiede JWT client)
router.get('/license/status', clientAuth, licenseStatus);

// C5 — poll messaggi in-app (richiede JWT client)
router.get('/messages', clientAuth, getMessages);

// C6 — rinnovo JWT client
router.post('/token/refresh', refreshToken);

module.exports = router;
