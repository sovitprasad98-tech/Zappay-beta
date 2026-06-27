// services/subscriptionService.js
const { ref, serverTimestamp } = require('../firebase/admin');
const { DB_PATHS, DEFAULT_PLANS } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Seed default plans into Firebase ONLY if they don't already exist.
 * Backend will NEVER overwrite existing admin-edited values.
 */
async function seedDefaultPlans() {
  const plansRef = ref(DB_PATHS.PLANS);
  const snap = await plansRef.once('value');

  if (snap.exists()) {
    logger.info('Plans already exist in DB — skipping seed.');
    return;
  }

  const updates = {};
  Object.values(DEFAULT_PLANS).forEach((plan) => {
    updates[plan.id] = { ...plan, createdAt: Date.now() };
  });

  await plansRef.update(updates);
  logger.info('✅ Default subscription plans seeded.');
}

/**
 * Get all active plans ordered by displayOrder
 */
async function getAllPlans() {
  const snap = await ref(DB_PATHS.PLANS).orderByChild('displayOrder').once('value');
  if (!snap.exists()) return [];
  const plans = [];
  snap.forEach((child) => {
    const plan = child.val();
    if (plan.isActive !== false) plans.push({ id: child.key, ...plan });
  });
  return plans;
}

/**
 * Get all plans including inactive (admin only)
 */
async function getAllPlansAdmin() {
  const snap = await ref(DB_PATHS.PLANS).orderByChild('displayOrder').once('value');
  if (!snap.exists()) return [];
  const plans = [];
  snap.forEach((child) => plans.push({ id: child.key, ...child.val() }));
  return plans.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

/**
 * Get a specific plan by ID
 */
async function getPlan(planId) {
  const snap = await ref(`${DB_PATHS.PLANS}/${planId}`).once('value');
  if (!snap.exists()) return null;
  return { id: planId, ...snap.val() };
}

/**
 * Get user's current subscription (with plan details)
 * Falls back to Blaze (free) plan if no subscription
 */
async function getUserSubscription(userId) {
  const snap = await ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`).once('value');

  if (!snap.exists()) {
    // Assign Blaze plan
    return await assignFreePlan(userId);
  }

  const sub = snap.val();

  // Check if paid subscription has expired
  if (sub.planId !== 'blaze' && sub.endDate && Date.now() > sub.endDate) {
    logger.info(`Subscription expired for ${userId}, reverting to Blaze`);
    return await assignFreePlan(userId);
  }

  // Attach full plan details
  const plan = await getPlan(sub.planId) || DEFAULT_PLANS[sub.planId] || DEFAULT_PLANS.blaze;
  return { ...sub, plan };
}

/**
 * Assign free Blaze plan to user
 */
async function assignFreePlan(userId) {
  const blazePlan = await getPlan('blaze') || DEFAULT_PLANS.blaze;
  const sub = {
    planId: 'blaze',
    planName: blazePlan.name,
    status: 'active',
    startDate: Date.now(),
    endDate: null,        // Free plan never expires
    price: 0,
    paymentLinksUsedThisMonth: 0,
    monthResetDate: getNextMonthReset(),
    withdrawalsThisWeek: 0,
    withdrawalsToday: 0,
    weekResetDate: getNextWeekReset(),
    dayResetDate: getNextDayReset(),
    updatedAt: Date.now(),
  };
  await ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`).set(sub);
  return { ...sub, plan: blazePlan };
}

/**
 * Upgrade user to a paid plan (called after admin manually activates,
 * or after payment verification for subscription purchase)
 */
async function activateSubscription(userId, planId, durationDays = 30) {
  const plan = await getPlan(planId) || DEFAULT_PLANS[planId];
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const now = Date.now();
  const endDate = durationDays > 0 ? now + durationDays * 24 * 60 * 60 * 1000 : null;

  const sub = {
    planId: plan.id,
    planName: plan.name,
    status: 'active',
    startDate: now,
    endDate,
    price: plan.price,
    paymentLinksUsedThisMonth: 0,
    monthResetDate: getNextMonthReset(),
    withdrawalsThisWeek: 0,
    withdrawalsToday: 0,
    weekResetDate: getNextWeekReset(),
    dayResetDate: getNextDayReset(),
    updatedAt: now,
  };

  await ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`).set(sub);
  logger.info(`Subscription activated: User=${userId}, Plan=${planId}`);
  return { ...sub, plan };
}

/**
 * Check and reset monthly link count if month has passed
 */
async function checkAndResetMonthlyLinks(userId) {
  const subRef = ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`);
  const snap = await subRef.once('value');
  if (!snap.exists()) return;

  const sub = snap.val();
  if (Date.now() > (sub.monthResetDate || 0)) {
    await subRef.update({
      paymentLinksUsedThisMonth: 0,
      monthResetDate: getNextMonthReset(),
    });
  }
}

/**
 * Increment payment link count for user
 */
async function incrementLinkCount(userId) {
  await checkAndResetMonthlyLinks(userId);
  const subRef = ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`);
  return new Promise((resolve, reject) => {
    subRef.transaction((sub) => {
      if (!sub) return sub;
      return { ...sub, paymentLinksUsedThisMonth: (sub.paymentLinksUsedThisMonth || 0) + 1 };
    }, (err, committed) => {
      if (err) reject(err);
      else resolve(committed);
    });
  });
}

/**
 * Check withdrawal limits based on plan
 */
async function checkWithdrawalLimit(userId, plan) {
  const subRef = ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`);
  const snap = await subRef.once('value');
  const sub = snap.val() || {};

  const period = plan.withdrawalPeriod || 'week';
  const maxCount = plan.withdrawalCount || 1;

  let usedCount, resetDate, resetKey, usedKey;

  if (period === 'day') {
    usedCount = sub.withdrawalsToday || 0;
    resetDate = sub.dayResetDate || 0;
    usedKey = 'withdrawalsToday';
    resetKey = 'dayResetDate';
    const isExpired = Date.now() > resetDate;
    if (isExpired) { usedCount = 0; }
  } else {
    usedCount = sub.withdrawalsThisWeek || 0;
    resetDate = sub.weekResetDate || 0;
    usedKey = 'withdrawalsThisWeek';
    resetKey = 'weekResetDate';
    const isExpired = Date.now() > resetDate;
    if (isExpired) { usedCount = 0; }
  }

  return {
    allowed: usedCount < maxCount,
    used: usedCount,
    max: maxCount,
    period,
    usedKey,
    resetKey,
  };
}

/**
 * Increment withdrawal count after successful submission
 */
async function incrementWithdrawalCount(userId, plan) {
  const info = await checkWithdrawalLimit(userId, plan);
  const subRef = ref(`${DB_PATHS.USER_SUBSCRIPTIONS}/${userId}`);
  const snap = await subRef.once('value');
  const sub = snap.val() || {};
  const period = plan.withdrawalPeriod || 'week';

  const update = {};
  if (period === 'day') {
    const isExpired = Date.now() > (sub.dayResetDate || 0);
    update.withdrawalsToday = isExpired ? 1 : (sub.withdrawalsToday || 0) + 1;
    if (isExpired) update.dayResetDate = getNextDayReset();
  } else {
    const isExpired = Date.now() > (sub.weekResetDate || 0);
    update.withdrawalsThisWeek = isExpired ? 1 : (sub.withdrawalsThisWeek || 0) + 1;
    if (isExpired) update.weekResetDate = getNextWeekReset();
  }

  await subRef.update(update);
}

// ── Date helpers ──
function getNextMonthReset() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getNextWeekReset() {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getNextDayReset() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

module.exports = {
  seedDefaultPlans,
  getAllPlans,
  getAllPlansAdmin,
  getPlan,
  getUserSubscription,
  assignFreePlan,
  activateSubscription,
  checkAndResetMonthlyLinks,
  incrementLinkCount,
  checkWithdrawalLimit,
  incrementWithdrawalCount,
};
