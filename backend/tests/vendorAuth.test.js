const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Genera chiavi RSA temporanee per i test (non serve la cartella keys/)
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const tmpDir = os.tmpdir();
const privPath = path.join(tmpDir, 'bkshield_test_private.pem');
const pubPath = path.join(tmpDir, 'bkshield_test_public.pem');
fs.writeFileSync(privPath, privateKey);
fs.writeFileSync(pubPath, publicKey);

// Env prima di caricare qualsiasi modulo del progetto
process.env.NODE_ENV = 'test';
process.env.DATABASE_FILE = path.join(tmpDir, 'bkshield_test_vendorauth.sqlite');
process.env.JWT_PRIVATE_KEY_PATH = privPath;
process.env.JWT_PUBLIC_KEY_PATH = pubPath;
process.env.JWT_TTL_SECONDS = '60';
process.env.REFRESH_TOKEN_TTL_SECONDS = '3600';
process.env.LICENSE_KEY_HMAC_SECRET = 'test_hmac_secret_xxxxxxxxxxxxxxxxxxxxxx';
process.env.OFFLINE_TOKEN_AES_KEY = '0'.repeat(64);
process.env.CREDENTIALS_KEY = '0'.repeat(64);
process.env.BCRYPT_ROUNDS = '4';
process.env.RATE_LIMIT_VENDOR_LOGIN_PER_HOUR = '100';

const app = require('../src/app');
const db = require('../src/config/db');
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

const RAW_API_KEY = crypto.randomBytes(16).toString('hex');

beforeAll(async () => {
  await db.migrate.latest({ directory: MIGRATIONS_DIR });

  const hash = await bcrypt.hash(RAW_API_KEY, 4);
  await db('vendors').insert({
    name: 'Test Vendor',
    email: 'vendor@test.it',
    api_key_hash: hash,
    api_key_history: '[]',
    is_active: 1,
  });
});

afterAll(async () => {
  await db.migrate.rollback({ directory: MIGRATIONS_DIR }, true);
  await db.destroy();
  try { fs.unlinkSync(process.env.DATABASE_FILE); } catch {}
  try { fs.unlinkSync(privPath); } catch {}
  try { fs.unlinkSync(pubPath); } catch {}
});

describe('F1 POST /api/vendor/auth/login', () => {
  it('200 con API key valida', async () => {
    const res = await request(app)
      .post('/api/vendor/auth/login')
      .send({ api_key: RAW_API_KEY });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 60 });
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
  });

  it('401 con API key errata', async () => {
    const res = await request(app)
      .post('/api/vendor/auth/login')
      .send({ api_key: 'chiave_sbagliata' });

    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('VENDOR_LOGIN_INVALID');
  });

  it('400 senza api_key', async () => {
    const res = await request(app)
      .post('/api/vendor/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('VALIDATION_ERROR');
  });
});

describe('F2 POST /api/vendor/token/refresh', () => {
  let refreshToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/vendor/auth/login')
      .send({ api_key: RAW_API_KEY });
    refreshToken = res.body.refresh_token;
  });

  it('200 con refresh token valido + rotation', async () => {
    const res = await request(app)
      .post('/api/vendor/token/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).not.toBe(refreshToken);

    // il token originale ora è revocato
    const res2 = await request(app)
      .post('/api/vendor/token/refresh')
      .send({ refresh_token: refreshToken });
    expect(res2.status).toBe(401);
    expect(res2.body.error_code).toBe('VENDOR_REFRESH_INVALID');
  });

  it('401 con refresh token inesistente', async () => {
    const res = await request(app)
      .post('/api/vendor/token/refresh')
      .send({ refresh_token: 'token_falso' });

    expect(res.status).toBe(401);
    expect(res.body.error_code).toBe('VENDOR_REFRESH_INVALID');
  });

  it('400 senza refresh_token', async () => {
    const res = await request(app)
      .post('/api/vendor/token/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('VALIDATION_ERROR');
  });
});
