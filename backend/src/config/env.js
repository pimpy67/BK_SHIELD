require('dotenv').config();

const required = [
    'JWT_PRIVATE_KEY_PATH',
    'JWT_PUBLIC_KEY_PATH',
    'LICENSE_KEY_HMAC_SECRET',
    'OFFLINE_TOKEN_AES_KEY',
];

for (const key of required) {
    if (!process.env[key]) {
      console.error(`ERRORE: variabile d'ambiente mancante: ${key}`);
      process.exit(1);
    }
}

module.exports = {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    dbFile: process.env.DATABASE_FILE || './data/licenses.sqlite',
    jwt: {
      privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH,
      publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
      ttlSeconds: parseInt(process.env.JWT_TTL_SECONDS) || 60,
      refreshTtlSeconds: parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS) || 3600,
    },
    crypto: {
      hmacSecret: process.env.LICENSE_KEY_HMAC_SECRET,
      aesKey: process.env.OFFLINE_TOKEN_AES_KEY,
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    },
    otp: {
      ttlMinutes: parseInt(process.env.OTP_TTL_MINUTES) || 15,
      maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
      lockoutMinutes: parseInt(process.env.OTP_LOCKOUT_MINUTES) || 30,
    },
};