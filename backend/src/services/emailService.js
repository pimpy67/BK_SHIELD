const axios = require('axios');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const env = require('../config/env');
const { decrypt } = require('./cryptoService');

// Recupera e decifra le credenziali email del vendor dal DB
async function getVendorEmailConfig(vendorId) {
  const creds = await db('vendor_credentials').where({ vendor_id: vendorId }).first();
  if (!creds || creds.email_provider === 'none') return null;

  if (creds.email_provider === 'msgraph') {
    return {
      provider: 'msgraph',
      tenant_id: decrypt(creds.msgraph_tenant_id_enc, env.crypto.credentialsKey),
      client_id: decrypt(creds.msgraph_client_id_enc, env.crypto.credentialsKey),
      client_secret: decrypt(creds.msgraph_client_secret_enc, env.crypto.credentialsKey),
    };
  }

  if (creds.email_provider === 'smtp') {
    return {
      provider: 'smtp',
      host: decrypt(creds.smtp_host_enc, env.crypto.credentialsKey),
      user: decrypt(creds.smtp_user_enc, env.crypto.credentialsKey),
      pass: decrypt(creds.smtp_pass_enc, env.crypto.credentialsKey),
    };
  }

  return null;
}

// Ottieni access token Microsoft Graph (client_credentials)
async function getMsGraphToken(tenantId, clientId, clientSecret) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const { data } = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return data.access_token;
}

async function sendViaMsGraph(config, vendor, { to, subject, html }) {
  const token = await getMsGraphToken(config.tenant_id, config.client_id, config.client_secret);
  await axios.post(
    'https://graph.microsoft.com/v1.0/me/sendMail',
    {
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { address: vendor.email_from_address, name: vendor.email_from_name } },
      },
      saveToSentItems: true,
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
}

async function sendViaSmtp(config, vendor, { to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: config.user, pass: config.pass },
  });
  await transporter.sendMail({
    from: `"${vendor.email_from_name}" <${vendor.email_from_address}>`,
    to,
    subject,
    html,
  });
}

// Entry point: invia email scegliendo il provider configurato per il vendor
async function sendEmail(vendorId, { to, subject, html }) {
  const vendor = await db('vendors').where({ id: vendorId }).first();
  const config = await getVendorEmailConfig(vendorId);

  if (!config) {
    // nessuna credenziale configurata: log in console (modalità sviluppo)
    console.log(`[EMAIL - NO PROVIDER] To: ${to} | Subject: ${subject}`);
    console.log('[EMAIL BODY]', html.replace(/<[^>]+>/g, ' ').trim().substring(0, 200));
    return;
  }

  if (config.provider === 'msgraph') {
    await sendViaMsGraph(config, vendor, { to, subject, html });
    return;
  }

  if (config.provider === 'smtp') {
    await sendViaSmtp(config, vendor, { to, subject, html });
    return;
  }
}

// Recupera e renderizza un template email dal DB con sostituzione placeholder
async function renderTemplate(key, variables) {
  const template = await db('email_templates').where({ key }).first();
  if (!template) {
    // template non ancora configurato: usa fallback testuale
    return {
      subject: key,
      html: `<p>${JSON.stringify(variables)}</p>`,
    };
  }

  let subject = template.subject;
  let html = template.body_html;
  for (const [k, v] of Object.entries(variables)) {
    const re = new RegExp(`{{${k}}}`, 'g');
    subject = subject.replace(re, v);
    html = html.replace(re, v);
  }
  return { subject, html };
}

module.exports = { sendEmail, renderTemplate };
