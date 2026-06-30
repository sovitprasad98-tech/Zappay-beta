// services/firebaseService.js - Firebase RTDB Operations
const { ref, serverTimestamp, admin } = require('../firebase/admin');
const { DB_PATHS, DEFAULT_SETTINGS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * =============================
 * USER OPERATIONS
 * =============================
 */

/**
 * Get user by UID
 */
async function getUser(uid) {
  const snap = await ref(`${DB_PATHS.USERS}/${uid}`).once('value');
  return snap.exists() ? { uid, ...snap.val() } : null;
}

/**
 * Generate a unique, human-shareable referral code (e.g. ZAP6UTQV85ZO)
 */
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `ZAP${suffix}`;
}

/**
 * Resolve a referral code to the referrer's UID (returns null if not found)
 */
async function getUidByReferralCode(code) {
  if (!code) return null;
  const snap = await ref(`${DB_PATHS.REFERRAL_CODES}/${code.trim().toUpperCase()}`).once('value');
  return snap.exists() ? snap.val() : null;
}

/**
 * Create or update user on login
 * @param {string} uid
 * @param {object} data
 * @param {string} [data.referralCode] - code of the user who referred this signup (NEW users only)
 */
async function upsertUser(uid, data) {
  const userRef = ref(`${DB_PATHS.USERS}/${uid}`);
  const snap = await userRef.once('value');

  if (!snap.exists()) {
    // New user — generate their own shareable referral code
    const myReferralCode = generateReferralCode();
    const settings = await getSettings();
    const signupBonus = settings.signupBonus || 0;

    // Resolve referrer (if a valid referral code was supplied at signup)
    let referredBy = null;
    let bonusGranted = 0;
    if (data.referralCode) {
      const referrerUid = await getUidByReferralCode(data.referralCode);
      if (referrerUid && referrerUid !== uid) {
        referredBy = referrerUid;
        bonusGranted = signupBonus;
      }
    }

    await userRef.set({
      uid,
      email: data.email,
      displayName: data.displayName || '',
      photoURL: data.photoURL || '',
      role: 'user',
      wallet: { balance: bonusGranted, lastUpdated: serverTimestamp() },
      isActive: true,
      isBanned: false,
      referralCode: myReferralCode,
      referredBy,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });

    // Register the code → uid index for fast lookup when others use it
    await ref(`${DB_PATHS.REFERRAL_CODES}/${myReferralCode}`).set(uid);

    // If referred, create the tracking record under the referrer's list
    if (referredBy) {
      await ref(`${DB_PATHS.REFERRALS}/${referredBy}/${uid}`).set({
        referredUid: uid,
        referrerUid: referredBy,
        name: data.displayName || 'User',
        email: data.email || '',
        status: 'waiting',          // waiting → completed (once qualifying deposit happens)
        signupBonusGiven: bonusGranted > 0,
        signupBonus: bonusGranted,
        purchaseAmount: null,
        commissionPercent: settings.referralCommissionPercent || 30,
        commission: null,
        createdAt: serverTimestamp(),
        completedAt: null,
      });
    }
  } else {
    // Existing user - update last login, and backfill a referral code
    // if they don't have one yet (e.g. account predates this feature)
    const existing = snap.val();
    const updates = {
      displayName: data.displayName || existing.displayName,
      photoURL: data.photoURL || existing.photoURL,
      lastLoginAt: serverTimestamp(),
    };
    if (!existing.referralCode) {
      const myReferralCode = generateReferralCode();
      updates.referralCode = myReferralCode;
      await ref(`${DB_PATHS.REFERRAL_CODES}/${myReferralCode}`).set(uid);
    }
    await userRef.update(updates);
  }

  const updated = await userRef.once('value');
  return { uid, ...updated.val() };
}

/**
 * Update user profile
 */
async function updateUserProfile(uid, data) {
  const allowed = ['displayName', 'phone', 'upiId', 'bankDetails'];
  const update = {};
  allowed.forEach((key) => {
    if (data[key] !== undefined) update[key] = data[key];
  });
  update.updatedAt = serverTimestamp();
  await ref(`${DB_PATHS.USERS}/${uid}`).update(update);
}

/**
 * Get all users (admin)
 */
async function getAllUsers() {
  const snap = await ref(DB_PATHS.USERS).once('value');
  if (!snap.exists()) return [];
  const users = [];
  snap.forEach((child) => {
    const user = child.val();
    // Remove sensitive wallet internals for list view
    users.push({
      uid: child.key,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      walletBalance: user.wallet?.balance || 0,
      isActive: user.isActive,
      isBanned: user.isBanned,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  });
  return users.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Ban or unban user
 */
async function setBanStatus(uid, isBanned) {
  await ref(`${DB_PATHS.USERS}/${uid}`).update({ isBanned, updatedAt: serverTimestamp() });
}

/**
 * =============================
 * PAYMENT OPERATIONS
 * =============================
 */

/**
 * Create a payment record
 */
async function createPayment(orderId, data) {
  await ref(`${DB_PATHS.PAYMENTS}/${orderId}`).set({
    orderId,
    userId: data.userId,
    amount: parseFloat(data.amount),
    status: 'pending',
    remark: data.remark || '',
    customerMobile: data.customerMobile || '',
    linkId: data.linkId || null,
    type: data.type || 'wallet_topup',
    planId: data.planId || null,
    commissionPercent: data.commissionPercent || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    environment: null,
  });
}

/**
 * Update payment status (webhook)
 */
async function updatePaymentStatus(orderId, data) {
  // IMPORTANT: this used to be a binary `data.status === 'Success' ?
  // 'success' : 'failed'` check — which meant ANY non-'Success' value,
  // including a still-genuine 'Pending', got written as 'failed'. That
  // silently broke real successful payments whenever the caller passed
  // through a transient 'Pending' (e.g. from the webhook's order-status
  // double-check racing ahead of Zap's own DB). Now we map all 3 real
  // states explicitly, and default to 'pending' (not 'failed') for
  // anything we don't recognize, so we never falsely fail a payment.
  const normalizedStatus =
    data.status === 'Success' ? 'success' :
    data.status === 'Failed'  ? 'failed'  :
    'pending';

  await ref(`${DB_PATHS.PAYMENTS}/${orderId}`).update({
    status: normalizedStatus,
    txnId: data.txn_id || '',
    utr: data.utr || '',
    payAmount: parseFloat(data.pay_amount || data.amount || 0),
    environment: data.environment || 'cashier',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get payment by orderId
 */
async function getPayment(orderId) {
  const snap = await ref(`${DB_PATHS.PAYMENTS}/${orderId}`).once('value');
  return snap.exists() ? snap.val() : null;
}

/**
 * Get payments by userId
 */
async function getUserPayments(userId, limit = 50) {
  const snap = await ref(DB_PATHS.PAYMENTS)
    .orderByChild('userId')
    .equalTo(userId)
    .limitToLast(limit)
    .once('value');

  if (!snap.exists()) return [];
  const payments = [];
  snap.forEach((child) => payments.push(child.val()));
  return payments.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get all payments (admin)
 */
async function getAllPayments(limit = 100) {
  const snap = await ref(DB_PATHS.PAYMENTS)
    .orderByChild('createdAt')
    .limitToLast(limit)
    .once('value');
  if (!snap.exists()) return [];
  const payments = [];
  snap.forEach((child) => payments.push(child.val()));
  return payments.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Check if order was already processed (duplicate prevention)
 */
async function isOrderProcessed(orderId) {
  const snap = await ref(`${DB_PATHS.PROCESSED_ORDERS}/${orderId}`).once('value');
  return snap.exists();
}

/**
 * Mark order as processed
 */
async function markOrderProcessed(orderId) {
  await ref(`${DB_PATHS.PROCESSED_ORDERS}/${orderId}`).set(serverTimestamp());
}

/**
 * Release an early claim made by markOrderProcessed — used ONLY when the
 * webhook's status turned out to be genuinely inconclusive (Pending /
 * unrecognized) after claiming early, so a later webhook retry or
 * order-status poll can still resolve this order instead of being
 * permanently blocked by our own duplicate-check.
 */
async function unmarkOrderProcessed(orderId) {
  await ref(`${DB_PATHS.PROCESSED_ORDERS}/${orderId}`).remove();
}

/**
 * =============================
 * WITHDRAWAL OPERATIONS
 * =============================
 */

/**
 * Create withdrawal request
 */
async function createWithdrawal(userId, data) {
  const withdrawalRef = ref(DB_PATHS.WITHDRAWALS).push();
  const id = withdrawalRef.key;
  await withdrawalRef.set({
    id,
    userId,
    amount: parseFloat(data.amount),
    commission: parseFloat(data.commission),
    netAmount: parseFloat(data.netAmount),
    upiId: data.upiId,
    accountName: data.accountName || '',
    status: 'pending',
    adminNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

/**
 * Update withdrawal status (admin)
 */
async function updateWithdrawalStatus(withdrawalId, status, adminNote = '') {
  await ref(`${DB_PATHS.WITHDRAWALS}/${withdrawalId}`).update({
    status,
    adminNote,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Get user withdrawals
 */
async function getUserWithdrawals(userId) {
  const snap = await ref(DB_PATHS.WITHDRAWALS)
    .orderByChild('userId')
    .equalTo(userId)
    .once('value');
  if (!snap.exists()) return [];
  const list = [];
  snap.forEach((child) => list.push(child.val()));
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get all withdrawals (admin)
 */
async function getAllWithdrawals() {
  const snap = await ref(DB_PATHS.WITHDRAWALS).once('value');
  if (!snap.exists()) return [];
  const list = [];
  snap.forEach((child) => list.push(child.val()));
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get withdrawal by ID
 */
async function getWithdrawal(withdrawalId) {
  const snap = await ref(`${DB_PATHS.WITHDRAWALS}/${withdrawalId}`).once('value');
  return snap.exists() ? snap.val() : null;
}

/**
 * =============================
 * PLATFORM SETTINGS
 * =============================
 */

/**
 * Get platform settings (with defaults)
 */
async function getSettings() {
  const snap = await ref(DB_PATHS.SETTINGS).once('value');
  if (!snap.exists()) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...snap.val() };
}

/**
 * Update platform settings (admin)
 */
async function updateSettings(data) {
  await ref(DB_PATHS.SETTINGS).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * =============================
 * ACTIVITY LOG
 * =============================
 */

/**
 * Log an activity
 */
async function logActivity(userId, action, details = {}) {
  const logRef = ref(DB_PATHS.ACTIVITY_LOGS).push();
  await logRef.set({
    userId,
    action,
    details,
    timestamp: serverTimestamp(),
    ip: details.ip || '',
  });
}

/**
 * Permanently delete a user record from the database.
 * NOTE: this removes the Realtime Database profile only — it does NOT
 * delete their Firebase Authentication account, so they could still sign
 * in (and a fresh profile would be created on next login, via upsertUser).
 * Their historical payments/withdrawals are kept for accounting records.
 */
async function deleteUser(uid) {
  const user = await getUser(uid);
  if (user?.referralCode) {
    await ref(`${DB_PATHS.REFERRAL_CODES}/${user.referralCode}`).remove();
  }
  await ref(`${DB_PATHS.USERS}/${uid}`).remove();
}

module.exports = {
  // Users
  getUser,
  upsertUser,
  updateUserProfile,
  getAllUsers,
  setBanStatus,
  generateReferralCode,
  getUidByReferralCode,
  deleteUser,
  // Payments
  createPayment,
  updatePaymentStatus,
  getPayment,
  getUserPayments,
  getAllPayments,
  isOrderProcessed,
  markOrderProcessed,
  unmarkOrderProcessed,
  // Withdrawals
  createWithdrawal,
  updateWithdrawalStatus,
  getUserWithdrawals,
  getAllWithdrawals,
  getWithdrawal,
  // Settings
  getSettings,
  updateSettings,
  // Logs
  logActivity,
};
