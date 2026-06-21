// controllers/promoController.js
const { body, validationResult } = require('express-validator');
const promoService = require('../services/promoService');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/** POST /api/promo/apply */
const applyPromo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

    const { code } = req.body;
    const result = await promoService.applyPromoCode(req.user.uid, code);

    return response.success(res, `Promo code applied! ₹${result.value} added to your wallet.`, result);
  } catch (err) {
    // These are user-facing validation messages (invalid/expired/used code)
    return response.error(res, err.message || 'Failed to apply promo code');
  }
};

const applyPromoValidation = [
  body('code').notEmpty().withMessage('Promo code is required').isLength({ max: 30 }).trim(),
];

module.exports = { applyPromo, applyPromoValidation };
