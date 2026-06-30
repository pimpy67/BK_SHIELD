const axios = require('axios');
const db = require('../config/db');
const env = require('../config/env');
const { createOtp, verifyOtp, isLockedOut, recordFailedAttempt } = require('../services/otpService');
const { createTrialLicense } = require('../services/licenseService');
const { sendEmail, renderTemplate } = require('../services/emailService');

const EU_COUNTRIES = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK']);

// Controllo VIES non bloccante
async function checkVies(country, vatNumber) {
  if (!country || !vatNumber || !EU_COUNTRIES.has(country.toUpperCase())) return null;
  const cc = country.toUpperCase();
  const vat = vatNumber.replace(/^[A-Z]{2}/i, '');
  try {
    const url = `${process.env.VIES_API_URL || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms'}/${cc}/vat/${vat}`;
    const { data } = await axios.get(url, { timeout: parseInt(process.env.VIES_TIMEOUT_MS) || 5000 });
    return data.isValid === true;
  } catch {
    return null; // VIES non disponibile: non blocchiamo
  }
}

// C1 POST /api/client/register
async function register(req, res, next) {
  try {
    const { product_code, machine_id, email, name, company, vat_number, country } = req.body;

    if (!product_code || !machine_id || !email) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'I campi product_code, machine_id ed email sono obbligatori.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const product = await db('products').where({ code: product_code.toUpperCase(), is_active: 1 }).first();
    if (!product) {
      return res.status(404).json({
        error_code: 'PRODUCT_NOT_FOUND',
        message: `Prodotto "${product_code}" non trovato o non attivo.`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const existing = await db('clients').where({ product_id: product.id, machine_id }).first();
    if (existing) {
      if (existing.registration_status === 'active') {
        return res.status(409).json({
          error_code: 'CLIENT_ALREADY_REGISTERED',
          message: 'Questo dispositivo è già registrato per il prodotto indicato.',
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
        });
      }
      if (existing.registration_status === 'suspended') {
        return res.status(403).json({
          error_code: 'CLIENT_SUSPENDED',
          message: 'Account sospeso. Contatta il supporto.',
          timestamp: new Date().toISOString(),
          request_id: req.requestId,
        });
      }
      // pending_otp: non riveliamo che esiste già, trattiamo come nuovo
      const { otp, expiresAt } = await createOtp(existing.id, 'registration');
      await sendEmailOtp(product.vendor_id, existing.email, otp, product, name || existing.name);
      return res.status(200).json({
        client_id: existing.id,
        message: 'Controlla la tua email per il codice OTP.',
        otp_expires_at: expiresAt,
      });
    }

    // VIES check non bloccante
    await checkVies(country, vat_number);

    const [clientId] = await db('clients').insert({
      product_id: product.id,
      email,
      name: name ?? null,
      company: company ?? null,
      vat_number: vat_number ?? null,
      country: country ?? null,
      machine_id,
      registration_status: 'pending_otp',
      vendor_synced: 0,
    });

    const { otp, expiresAt } = await createOtp(clientId, 'registration');
    await sendEmailOtp(product.vendor_id, email, otp, product, name);

    return res.status(201).json({
      client_id: clientId,
      message: 'Registrazione avviata. Controlla la tua email per il codice OTP.',
      otp_expires_at: expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

// C2 POST /api/client/verify-otp
async function verifyOtpEndpoint(req, res, next) {
  try {
    const { client_id, otp } = req.body;

    if (!client_id || !otp) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'I campi client_id e otp sono obbligatori.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const client = await db('clients').where({ id: client_id }).first();
    if (!client) {
      return res.status(404).json({
        error_code: 'CLIENT_NOT_FOUND',
        message: 'Cliente non trovato.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Idempotenza: se già attivo, restituisce la licenza esistente
    if (client.registration_status === 'active') {
      const product = await db('products').where({ id: client.product_id }).first();
      const license = await db('licenses')
        .where({ client_id: client.id })
        .whereIn('status', ['active', 'suspended'])
        .first();
      const setup = await db('vendor_general_setup').first();
      return res.status(200).json({
        license_key: license.license_key,
        type: license.type,
        status: license.status,
        start_date: license.start_date,
        end_date: license.end_date,
        offline_token: client.offline_token,
        check_interval_hours: setup?.default_check_interval_hours ?? 24,
      });
    }

    if (client.registration_status === 'suspended') {
      return res.status(403).json({
        error_code: 'CLIENT_SUSPENDED',
        message: 'Account sospeso. Contatta il supporto.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Controllo lockout
    if (await isLockedOut(client_id)) {
      return res.status(429).json({
        error_code: 'OTP_LOCKED_OUT',
        message: `Troppi tentativi errati. Riprova tra ${env.otp.lockoutMinutes} minuti.`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const { valid } = await verifyOtp(client_id, otp, 'registration');
    if (!valid) {
      await recordFailedAttempt(client_id);
      const remaining = env.otp.maxAttempts - (await countRecentAttempts(client_id));
      return res.status(401).json({
        error_code: 'OTP_INVALID',
        message: `OTP non valido o scaduto. Tentativi rimanenti: ${Math.max(0, remaining)}.`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const product = await db('products').where({ id: client.product_id }).first();
    const licenseData = await createTrialLicense(client.id, product);

    await db('clients').where({ id: client.id }).update({
      registration_status: 'active',
      vendor_synced: 0,
      offline_token: licenseData.offline_token,
      last_seen_at: new Date().toISOString(),
    });

    // Email di benvenuto non bloccante
    sendWelcomeEmail(product.vendor_id, client.email, client.name, licenseData).catch(() => {});

    const setup = await db('vendor_general_setup').first();
    return res.status(200).json({
      license_key: licenseData.license_key,
      type: licenseData.type,
      status: licenseData.status,
      start_date: licenseData.start_date,
      end_date: licenseData.end_date,
      offline_token: licenseData.offline_token,
      check_interval_hours: setup?.default_check_interval_hours ?? 24,
    });
  } catch (err) {
    next(err);
  }
}

// C3 POST /api/client/resend-otp
async function resendOtp(req, res, next) {
  try {
    const { client_id, email } = req.body;

    if (!client_id || !email) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'I campi client_id ed email sono obbligatori.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const client = await db('clients').where({ id: client_id, email }).first();
    if (!client || client.registration_status !== 'pending_otp') {
      return res.status(404).json({
        error_code: 'CLIENT_NOT_FOUND',
        message: 'Cliente non trovato o non in attesa di OTP.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    // Controlla se l'OTP esistente è ancora valido
    const now = new Date().toISOString();
    const activeOtp = await db('otp_codes')
      .where({ client_id: client.id, type: 'registration' })
      .whereNull('used_at')
      .where('expires_at', '>', now)
      .first();

    if (activeOtp) {
      return res.status(400).json({
        error_code: 'OTP_STILL_VALID',
        message: 'Il codice OTP precedente è ancora valido. Attendi la scadenza prima di richiederne uno nuovo.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const product = await db('products').where({ id: client.product_id }).first();
    const { otp, expiresAt } = await createOtp(client.id, 'registration');
    await sendEmailOtp(product.vendor_id, client.email, otp, product, client.name);

    return res.status(200).json({
      message: 'Nuovo codice OTP inviato alla tua email.',
      otp_expires_at: expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

// Helper: conta tentativi recenti
async function countRecentAttempts(clientId) {
  const windowStart = new Date(Date.now() - env.otp.lockoutMinutes * 60 * 1000).toISOString();
  const row = await db('otp_attempts')
    .where({ client_id: clientId })
    .where('attempted_at', '>=', windowStart)
    .count('id as cnt')
    .first();
  return parseInt(row.cnt);
}

// Helper: email OTP
async function sendEmailOtp(vendorId, to, otp, product, recipientName) {
  const { subject, html } = await renderTemplate('otp_registration', {
    otp,
    product_name: product.name,
    recipient_name: recipientName || 'Cliente',
    expires_minutes: env.otp.ttlMinutes,
  });
  await sendEmail(vendorId, { to, subject, html });
}

// Helper: email benvenuto dopo attivazione trial
async function sendWelcomeEmail(vendorId, to, recipientName, licenseData) {
  const { subject, html } = await renderTemplate('trial_welcome', {
    recipient_name: recipientName || 'Cliente',
    license_key: licenseData.license_key,
    end_date: licenseData.end_date,
    download_url: process.env.APP_DOWNLOAD_URL || '#',
  });
  await sendEmail(vendorId, { to, subject, html });
}

module.exports = { register, verifyOtpEndpoint, resendOtp };
