const db = require('../config/db');

const VALID_INVOICE_TRIGGERS = ['invoice_issued', 'payment_received'];

// F6 POST /api/vendor/products
async function createProduct(req, res, next) {
  try {
    const { name, code, trial_duration_days, trial_modules, license_check_frequency_days, invoice_trigger, modules } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: 'I campi name e code sono obbligatori.',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    if (invoice_trigger && !VALID_INVOICE_TRIGGERS.includes(invoice_trigger)) {
      return res.status(400).json({
        error_code: 'VALIDATION_ERROR',
        message: `invoice_trigger non valido. Valori ammessi: ${VALID_INVOICE_TRIGGERS.join(', ')}.`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const existing = await db('products').where({ code }).first();
    if (existing) {
      return res.status(409).json({
        error_code: 'PRODUCT_CODE_EXISTS',
        message: `Esiste già un prodotto con codice "${code}".`,
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
      });
    }

    const [productId] = await db('products').insert({
      vendor_id: req.vendorId,
      name,
      code: code.toUpperCase(),
      trial_duration_days: trial_duration_days ?? 30,
      trial_modules: JSON.stringify(trial_modules ?? []),
      license_check_frequency_days: license_check_frequency_days ?? 1,
      invoice_trigger: invoice_trigger ?? 'invoice_issued',
      is_active: 1,
    });

    if (Array.isArray(modules) && modules.length > 0) {
      const moduleRows = modules.map((m) => ({
        product_id: productId,
        code: m.code,
        name: m.name,
        description: m.description ?? null,
        is_active: 1,
      }));
      await db('modules').insert(moduleRows);
    }

    return res.status(201).json({
      product_id: productId,
      code: code.toUpperCase(),
      message: 'Prodotto registrato con successo.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/vendor/products — lista prodotti del vendor
async function listProducts(req, res, next) {
  try {
    const products = await db('products')
      .where({ vendor_id: req.vendorId })
      .select('id', 'name', 'code', 'trial_duration_days', 'license_check_frequency_days', 'invoice_trigger', 'is_active', 'created_at');

    const result = await Promise.all(
      products.map(async (p) => {
        const mods = await db('modules').where({ product_id: p.id }).select('code', 'name', 'is_active');
        return { ...p, modules: mods };
      })
    );

    return res.status(200).json({ products: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { createProduct, listProducts };
