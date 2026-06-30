const express = require('express');
const router = express.Router();
const { register, verifyOtpEndpoint, resendOtp } = require('../../controllers/clientController');
const { createRateLimiter } = require('../../middleware/rateLimit');

const registerRateLimit = createRateLimiter('client_register', 'RATE_LIMIT_REGISTER_PER_HOUR', 5);
const resendOtpRateLimit = createRateLimiter('client_resend_otp', 'RATE_LIMIT_RESEND_OTP_PER_HOUR', 3);

// C1 — registrazione automatica all'installazione
router.post('/register', registerRateLimit, register);

// C2 — verifica OTP + attivazione trial
router.post('/verify-otp', verifyOtpEndpoint);

// C3 — nuovo OTP se scaduto
router.post('/resend-otp', resendOtpRateLimit, resendOtp);

module.exports = router;
