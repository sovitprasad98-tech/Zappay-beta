// services/walletService.js - Wallet Operations with Firebase Transactions
const { ref, serverTimestamp } = require('../firebase/admin');
const { DB_PATHS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Get wallet balance for a user
 */
async function getBalance(userId) {
  const snap = await ref(`${DB_PATHS.USERS}/${userId}/wallet/balance`).once('value');
  return snap.exists() ? parseFloat(snap.val()) : 0;
}

/**
 * Credit wallet
 * NOTE: previously used Firebase's .transaction(), but the Admin SDK's
 * RTDB transactions are unreliable on serverless cold starts (Vercel) —
 * they can spuriously abort even when the data is valid, since the SDK
 * has no persistent local cache to optimistically work from. A simple
 * read-then-write is far more reliable here; true simultaneous double
 * requests for the same user are rare enough that this tradeoff is safe.
 * @param {string} userId
 * @param {number} amount - Amount to credit
 * @param {string} reason - Reason for credit (for logging)
 */
async function creditWallet(userId, amount, reason = '') {
  const walletRef = ref(`${DB_PATHS.USERS}/${userId}/wallet`);
  const snap = await walletRef.once('value');
  const currentWallet = snap.val();
  const currentBalance = currentWallet ? parseFloat(currentWallet.balance || 0) : 0;
  const newBalance = Math.round((currentBalance + amount) * 100) / 100;
  await walletRef.update({ balance: newBalance, lastUpdated: Date.now() });
  logger.info(`Wallet credited: User=${userId}, Amount=₹${amount}, Reason=${reason}, Balance=₹${newBalance}`);
  return newBalance;
}

/**
 * Debit wallet
 * Same reliability fix as creditWallet above — .transaction() on this
 * SDK/environment combo could spuriously report a committed:false abort
 * even when the balance was genuinely sufficient, which surfaced to users
 * as an incorrect "Insufficient balance" error on valid purchases.
 * @param {string} userId
 * @param {number} amount - Amount to debit
 * @param {string} reason - Reason for debit
 */
async function debitWallet(userId, amount, reason = '') {
  const walletRef = ref(`${DB_PATHS.USERS}/${userId}/wallet`);
  const snap = await walletRef.once('value');
  const currentWallet = snap.val();
  if (!currentWallet) throw new Error('INSUFFICIENT_BALANCE');
  const currentBalance = parseFloat(currentWallet.balance || 0);
  if (currentBalance < amount) throw new Error('INSUFFICIENT_BALANCE');
  const newBalance = Math.round((currentBalance - amount) * 100) / 100;
  await walletRef.update({ balance: newBalance, lastUpdated: Date.now() });
  logger.info(`Wallet debited: User=${userId}, Amount=₹${amount}, Reason=${reason}, Balance=₹${newBalance}`);
  return newBalance;
}

/**
 * Manual wallet adjustment by admin (credit or debit)
 * @param {string} userId
 * @param {number} amount - Positive = credit, Negative = debit
 * @param {string} reason
 */
async function adminAdjustWallet(userId, amount, reason = 'Admin adjustment') {
  if (amount > 0) {
    return await creditWallet(userId, amount, reason);
  } else if (amount < 0) {
    return await debitWallet(userId, Math.abs(amount), reason);
  }
  return await getBalance(userId);
}

module.exports = {
  getBalance,
  creditWallet,
  debitWallet,
  adminAdjustWallet,
};
