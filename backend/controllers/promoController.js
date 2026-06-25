// controllers/promoController.js
const { body, validationResult } = require('express-validator');
const promoService = require('../services/promoService');
const { ref, serverTimestamp } = require('../firebase/admin');
const { DB_PATHS } = require('../config/constants');
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

/** GET /api/admin/promo-codes — list all codes */
const adminGetPromoCodes = async (req, res) => {
  try {
    const snap = await ref(DB_PATHS.PROMO_CODES).once('value');
    const codes = [];
    if (snap.exists()) snap.forEach((c) => codes.push(c.val()));
    codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return response.success(res, 'Promo codes fetched', { codes });
  } catch (err) {
    logger.error('Admin get promo codes error:', err.message);
    return response.serverError(res, err.message);
  }
};

/** POST /api/admin/promo-codes — create a new code */
const adminCreatePromoCode = async (req, res) => {
  try {
    const { code, type, value, maxUses, perUserLimit, description, expiresAt } = req.body;
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return response.error(res, 'Code is required');
    if (!value || parseFloat(value) <= 0) return response.error(res, 'Value must be greater than 0');

    const existing = await ref(`${DB_PATHS.PROMO_CODES}/${cleanCode}`).once('value');
    if (existing.exists()) return response.error(res, `Promo code "${cleanCode}" already exists.`);

    await ref(`${DB_PATHS.PROMO_CODES}/${cleanCode}`).set({
      code: cleanCode,
      type: type === 'percent' ? 'percent' : 'fixed',
      value: parseFloat(value),
      maxUses: maxUses === -1 || maxUses === undefined ? -1 : parseInt(maxUses),
      usedCount: 0,
      perUserLimit: parseInt(perUserLimit) || 1,
      isActive: true,
      description: description || '',
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
      createdAt: Date.now(),
    });

    return response.success(res, 'Promo code created', { code: cleanCode });
  } catch (err) {
    logger.error('Admin create promo code error:', err.message);
    return response.serverError(res, err.message);
  }
};

/** PUT /api/admin/promo-codes/:code/toggle — enable/disable a code */
const adminTogglePromoCode = async (req, res) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const snap = await ref(`${DB_PATHS.PROMO_CODES}/${code}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Promo code not found');
    const newStatus = !snap.val().isActive;
    await ref(`${DB_PATHS.PROMO_CODES}/${code}/isActive`).set(newStatus);
    return response.success(res, `Promo code ${newStatus ? 'activated' : 'deactivated'}`, { isActive: newStatus });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

module.exports = {
  applyPromo, applyPromoValidation,
  adminGetPromoCodes, adminCreatePromoCode, adminTogglePromoCode,
};
