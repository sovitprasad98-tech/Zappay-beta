// routes/promo.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/promoController');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

router.post('/apply', authenticate, paymentLimiter, ctrl.applyPromoValidation, ctrl.applyPromo);

module.exports = router;
