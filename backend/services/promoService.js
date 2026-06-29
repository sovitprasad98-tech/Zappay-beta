// services/promoService.js
const { ref, serverTimestamp } = require('../firebase/admin');
const { DB_PATHS, DEFAULT_PROMO_CODES } = require('../config/constants');
const walletService = require('./walletService');
const logger = require('../utils/logger');

/**
 * Seed default promo codes once — never overwrites existing codes
 * (so admin edits made later are preserved).
 */
async function seedDefaultPromoCodes() {
  for (const promo of Object.values(DEFAULT_PROMO_CODES)) {
    const snap = await ref(`${DB_PATHS.PROMO_CODES}/${promo.code}`).once('value');
    if (!snap.exists()) {
      await ref(`${DB_PATHS.PROMO_CODES}/${promo.code}`).set(promo);
      logger.info(`Seeded promo code: ${promo.code}`);
    }
  }
}

/**
 * Apply/redeem a promo code for a user. Throws a user-facing Error on
 * any validation failure (invalid code, expired, already used, etc).
 */
async function applyPromoCode(uid, codeInput) {
  const code = (codeInput || '').trim().toUpperCase();
  if (!code) throw new Error('Please enter a promo code');

  const snap = await ref(`${DB_PATHS.PROMO_CODES}/${code}`).once('value');
  if (!snap.exists()) throw new Error('Invalid promo code');
  const promo = snap.val();

  if (!promo.isActive) throw new Error('This promo code is no longer active');
  if (promo.expiresAt && Date.now() > promo.expiresAt) throw new Error('This promo code has expired');
  if (promo.maxUses !== -1 && (promo.usedCount || 0) >= promo.maxUses) {
    throw new Error('This promo code has reached its usage limit');
  }

  // Per-user one-time usage check
  const redemptionRef = ref(`${DB_PATHS.PROMO_REDEMPTIONS}/${uid}/${code}`);
  const redeemedSnap = await redemptionRef.once('value');
  if (redeemedSnap.exists()) throw new Error('You have already used this promo code');

  const value = parseFloat(promo.value) || 0;
  if (value > 0) {
    await walletService.creditWallet(uid, value, `Promo code: ${code}`);
  }

  await redemptionRef.set({ code, value, redeemedAt: serverTimestamp() });

  // Best-effort usage counter (read-then-write, same reliability fix as wallet)
  try {
    const counterSnap = await ref(`${DB_PATHS.PROMO_CODES}/${code}/usedCount`).once('value');
    await ref(`${DB_PATHS.PROMO_CODES}/${code}/usedCount`).set((counterSnap.val() || 0) + 1);
  } catch (e) { /* non-critical */ }

  return { code, value };
}

module.exports = { seedDefaultPromoCodes, applyPromoCode };
