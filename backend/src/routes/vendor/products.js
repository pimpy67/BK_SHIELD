const express = require('express');
const router = express.Router();
const { createProduct, listProducts } = require('../../controllers/vendorProductController');
const vendorAuth = require('../../middleware/vendorAuth');

// F6 — registrazione nuovo prodotto
router.post('/products', vendorAuth, createProduct);

// utility: lista prodotti del vendor (utile per la demo e il portale)
router.get('/products', vendorAuth, listProducts);

module.exports = router;
