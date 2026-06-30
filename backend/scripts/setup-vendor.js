/**
 * Inizializzazione vendor e configurazione di default.
 * Eseguire UNA SOLA VOLTA sul server dopo la prima migration.
 * Usage: node scripts/setup-vendor.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY || '0'.repeat(64);

const db = require('../src/config/db');
const env = require('../src/config/env');

async function main() {
  const existing = await db('vendors').count('id as cnt').first();
  if (existing.cnt > 0) {
    console.log('Vendor già configurato. Usa F9 /api/vendor/auth/rotate-key per ruotare la chiave.');
    await db.destroy();
    return;
  }

  const rawApiKey = crypto.randomBytes(32).toString('hex');
  const apiKeyHash = await bcrypt.hash(rawApiKey, env.crypto.bcryptRounds);

  const [vendorId] = await db('vendors').insert({
    name: 'BK Solutions',
    email: 'admin@bk-solutions.it',
    email_from_name: 'BK Solutions',
    email_from_address: 'noreply@bk-solutions.it',
    api_key_hash: apiKeyHash,
    api_key_history: '[]',
    is_active: 1,
  });

  await db('vendor_general_setup').insert({
    default_check_interval_hours: parseInt(process.env.DEFAULT_CHECK_INTERVAL_HOURS) || 24,
  });

  const events = [
    { event_code: 'NEW_REGISTRATION',  enabled: 1 },
    { event_code: 'LICENSE_EXPIRING',  enabled: 1 },
    { event_code: 'LICENSE_EXPIRED',   enabled: 1 },
    { event_code: 'CLIENT_INACTIVE',   enabled: 1 },
    { event_code: 'ALARM_RETRY',       enabled: 1 },
  ];
  await db('vendor_event_config').insert(events);

  console.log('');
  console.log('=== VENDOR CONFIGURATO ===');
  console.log(`Vendor ID   : ${vendorId}`);
  console.log(`Nome        : BK Solutions`);
  console.log(`API Key     : ${rawApiKey}`);
  console.log('');
  console.log('IMPORTANTE: salva la API Key — non verrà mostrata di nuovo.');
  console.log('');

  await db.destroy();
}

main().catch((err) => {
  console.error('ERRORE:', err.message);
  process.exit(1);
});
