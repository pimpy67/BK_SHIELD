const crypto = require('crypto');
const db = require('../config/db');
const env = require('../config/env');
const { encrypt } = require('./cryptoService');

function generateLicenseKey(clientId, productCode) {
  return crypto
    .createHmac('sha256', env.crypto.hmacSecret)
    .update(`${clientId}:${productCode}:${Date.now()}`)
    .digest('hex');
}

function buildOfflineToken(licenseKey, type, status, endDate, modules) {
  const payload = JSON.stringify({ license_key: licenseKey, type, status, end_date: endDate, modules });
  return encrypt(payload, env.crypto.aesKey);
}

async function createTrialLicense(clientId, product) {
  const existing = await db('licenses')
    .where({ client_id: clientId })
    .whereIn('status', ['active', 'suspended'])
    .first();
  if (existing) return existing;

  const licenseKey = generateLicenseKey(clientId, product.code);
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + product.trial_duration_days * 86400000).toISOString().slice(0, 10);

  const [licenseId] = await db('licenses').insert({
    client_id: clientId,
    product_id: product.id,
    license_key: licenseKey,
    type: 'trial',
    status: 'active',
    start_date: startDate,
    end_date: endDate,
    activated_at: new Date().toISOString(),
  });

  // associa i moduli trial
  const trialModuleCodes = JSON.parse(product.trial_modules || '[]');
  if (trialModuleCodes.length > 0) {
    const modulesInDb = await db('modules')
      .where({ product_id: product.id })
      .whereIn('code', trialModuleCodes);
    if (modulesInDb.length > 0) {
      await db('license_modules').insert(
        modulesInDb.map((m) => ({ license_id: licenseId, module_id: m.id, enabled: 1 }))
      );
    }
  }

  const activeModules = await db('license_modules')
    .join('modules', 'license_modules.module_id', 'modules.id')
    .where({ 'license_modules.license_id': licenseId, 'license_modules.enabled': 1 })
    .pluck('modules.code');

  const offlineToken = buildOfflineToken(licenseKey, 'trial', 'active', endDate, activeModules);

  return { id: licenseId, license_key: licenseKey, type: 'trial', status: 'active', start_date: startDate, end_date: endDate, offline_token: offlineToken, modules: activeModules };
}

module.exports = { generateLicenseKey, createTrialLicense };
