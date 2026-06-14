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
 * Credit wallet - uses Firebase transaction to prevent race conditions
 * @param {string} userId
 * @param {number} amount - Amount to credit
 * @param {string} reason - Reason for credit (for logging)
 */
async function creditWallet(userId, amount, reason = '') {
  const walletRef = ref(`${DB_PATHS.USERS}/${userId}/wallet`);

  return new Promise((resolve, reject) => {
    walletRef.transaction(
      (currentWallet) => {
        if (currentWallet === null) {
          return { balance: amount, lastUpdated: Date.now() };
        }
        const currentBalance = parseFloat(currentWallet.balance || 0);
        return {
          ...currentWallet,
          balance: Math.round((currentBalance + amount) * 100) / 100,
          lastUpdated: Date.now(),
        };
      },
      (error, committed, snapshot) => {
        if (error) {
          logger.error(`Wallet credit error for ${userId}:`, error.message);
          reject(error);
        } else if (!committed) {
          reject(new Error('Transaction not committed'));
        } else {
          const newBalance = snapshot.val().balance;
          logger.info(`Wallet credited: User=${userId}, Amount=₹${amount}, Reason=${reason}, Balance=₹${newBalance}`);
          resolve(newBalance);
        }
      }
    );
  });
}

/**
 * Debit wallet - uses Firebase transaction to prevent overdraft
 * @param {string} userId
 * @param {number} amount - Amount to debit
 * @param {string} reason - Reason for debit
 */
async function debitWallet(userId, amount, reason = '') {
  const walletRef = ref(`${DB_PATHS.USERS}/${userId}/wallet`);

  return new Promise((resolve, reject) => {
    walletRef.transaction(
      (currentWallet) => {
        if (currentWallet === null) {
          return; // Abort - wallet doesn't exist
        }
        const currentBalance = parseFloat(currentWallet.balance || 0);
        if (currentBalance < amount) {
          return; // Abort - insufficient balance
        }
        return {
          ...currentWallet,
          balance: Math.round((currentBalance - amount) * 100) / 100,
          lastUpdated: Date.now(),
        };
      },
      (error, committed, snapshot) => {
        if (error) {
          logger.error(`Wallet debit error for ${userId}:`, error.message);
          reject(error);
        } else if (!committed) {
          reject(new Error('INSUFFICIENT_BALANCE'));
        } else {
          const newBalance = snapshot.val().balance;
          logger.info(`Wallet debited: User=${userId}, Amount=₹${amount}, Reason=${reason}, Balance=₹${newBalance}`);
          resolve(newBalance);
        }
      }
    );
  });
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
