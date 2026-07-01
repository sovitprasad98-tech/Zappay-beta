// controllers/subscriptionController.js
const subscriptionService = require('../services/subscriptionService');
const firebaseService     = require('../services/firebaseService');
const walletService       = require('../services/walletService');
const notificationService = require('../services/notificationService');
const zapService          = require('../services/zapService');
const { ref }             = require('../firebase/admin');
const { DB_PATHS, DEFAULT_PLANS } = require('../config/constants');
const response = require('../helpers/response');
const logger   = require('../utils/logger');
const { body, validationResult } = require('express-validator');

/** GET /api/subscription/plans — public */
const getPlans = async (req, res) => {
  try {
    let plans = await subscriptionService.getAllPlans();

    // Fallback: if DB empty, return defaults (happens before first seed)
    if (!plans || plans.length === 0) {
      plans = Object.values(DEFAULT_PLANS).filter(p => p.isActive !== false);
    }

    return response.success(res, 'Plans fetched', { plans });
  } catch (err) {
    // Always return default plans even on error
    const plans = Object.values(DEFAULT_PLANS);
    return response.success(res, 'Plans fetched', { plans });
  }
};

/** GET /api/subscription/my */
const getMySubscription = async (req, res) => {
  try {
    const sub = await subscriptionService.getUserSubscription(req.user.uid);
    return response.success(res, 'Subscription fetched', { subscription: sub });
  } catch (err) {
    logger.error('Get subscription error:', err.message);
    // Return Blaze as fallback
    return response.success(res, 'Subscription fetched', {
      subscription: {
        planId: 'blaze', status: 'active', endDate: null,
        paymentLinksUsedThisMonth: 0,
        plan: DEFAULT_PLANS.blaze
      }
    });
  }
};

/**
 * POST /api/subscription/purchase
 * Creates a Zap UPI order for plan upgrade
 */
const purchasePlan = async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return response.error(res, 'planId required');

    const plan = await subscriptionService.getPlan(planId) || DEFAULT_PLANS[planId];
    if (!plan) return response.notFound(res, 'Plan not found');
    if (plan.price === 0) return response.error(res, 'Blaze plan is free — no payment needed');

    const userId  = req.user.uid;
    const orderId = zapService.generateOrderId(userId);

    // Save subscription order in payments with type='subscription'
    await firebaseService.createPayment(orderId, {
      userId,
      amount: plan.price,
      remark: `ZapPay Subscription: ${plan.name}`,
      type: 'subscription',
      planId: plan.id,
    });

    // Create Zap UPI order
    const zapOrder = await zapService.createOrder({
      orderId,
      amount: String(plan.price.toFixed(2)),
      remark: `ZapPay ${plan.name} Plan`,
    });

    logger.info(`Subscription order: ${orderId} user=${userId} plan=${planId}`);

    return response.success(res, 'Payment order created', {
      orderId: zapOrder.orderId,
      paymentUrl: zapOrder.paymentUrl,
      amount: plan.price,
      planName: plan.name,
    });
  } catch (err) {
    logger.error('Purchase plan error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * POST /api/subscription/purchase-wallet
 * Pay for a plan upgrade directly from wallet balance — instant activation,
 * no UPI gateway involved.
 */
const purchasePlanWithWallet = async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return response.error(res, 'planId required');

    const plan = await subscriptionService.getPlan(planId) || DEFAULT_PLANS[planId];
    if (!plan) return response.notFound(res, 'Plan not found');
    if (plan.price === 0) return response.error(res, 'Blaze plan is free — no payment needed');

    const userId  = req.user.uid;
    const balance = await walletService.getBalance(userId);

    if (balance < plan.price) {
      return response.error(res, `Insufficient wallet balance. You need ₹${plan.price}, available: ₹${balance.toFixed(2)}`);
    }

    // Debit wallet (transaction-safe, re-checks balance internally)
    try {
      await walletService.debitWallet(userId, plan.price, `Subscription: ${plan.name}`);
    } catch (debitErr) {
      if (debitErr.message === 'INSUFFICIENT_BALANCE') {
        return response.error(res, 'Insufficient wallet balance.');
      }
      throw debitErr;
    }

    // Activate immediately — no webhook needed for wallet payments
    const sub = await subscriptionService.activateSubscription(userId, planId, 30);

    const orderId = zapService.generateOrderId(userId);
    await firebaseService.createPayment(orderId, {
      userId,
      amount: plan.price,
      remark: `ZapPay Subscription (Wallet): ${plan.name}`,
      type: 'subscription',
      planId: plan.id,
    });
    await firebaseService.updatePaymentStatus(orderId, { status: 'Success', txn_id: 'WALLET', utr: '', amount: plan.price, pay_amount: plan.price });

    await notificationService.createNotification(userId, {
      title: `🎉 ${plan.name} Plan Activated!`,
      message: `₹${plan.price} deducted from wallet. Your ${plan.name} subscription is now active for 30 days.`,
      type: 'subscription',
    });

    await firebaseService.logActivity(userId, 'SUBSCRIPTION_ACTIVATED_WALLET', {
      planId: plan.id, planName: plan.name, amount: plan.price, orderId,
    });

    logger.info(`Subscription via wallet: ${userId} → ${planId}`);

    return response.success(res, `${plan.name} plan activated!`, {
      subscription: sub,
      plan,
      orderId,
    });
  } catch (err) {
    logger.error('Purchase plan with wallet error:', err.message);
    return response.serverError(res, err.message);
  }
};

// ─── Admin Plan Management ──────────────────────────────────

const adminGetPlans = async (req, res) => {
  try {
    let plans = await subscriptionService.getAllPlansAdmin();
    if (!plans || plans.length === 0) plans = Object.values(DEFAULT_PLANS);
    return response.success(res, 'Plans fetched', { plans });
  } catch (err) {
    return response.success(res, 'Plans fetched', { plans: Object.values(DEFAULT_PLANS) });
  }
};

const adminCreatePlan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

    const { id, name, badge, price, walletLimit, paymentLinksPerMonth,
      linkExpiryDays, commissionPercent, withdrawalCount, withdrawalPeriod,
      features, isHighlighted, displayOrder } = req.body;

    const existing = await ref(`${DB_PATHS.PLANS}/${id}`).once('value');
    if (existing.exists()) return response.error(res, `Plan ID "${id}" already exists.`);

    const plan = {
      id, name, badge: badge || '',
      price: parseFloat(price),
      walletLimit: parseFloat(walletLimit),
      paymentLinksPerMonth: parseInt(paymentLinksPerMonth),
      linkExpiryDays: parseInt(linkExpiryDays),
      commissionPercent: parseFloat(commissionPercent),
      withdrawalCount: parseInt(withdrawalCount),
      withdrawalPeriod: withdrawalPeriod || 'week',
      features: Array.isArray(features) ? features : [],
      isHighlighted: !!isHighlighted,
      isDefault: false, isActive: true,
      displayOrder: parseInt(displayOrder) || 99,
      createdAt: Date.now(),
    };

    await ref(`${DB_PATHS.PLANS}/${id}`).set(plan);
    return response.success(res, 'Plan created', { plan }, 201);
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

const adminUpdatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await ref(`${DB_PATHS.PLANS}/${id}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Plan not found');

    const allowed = ['name','badge','price','walletLimit','paymentLinksPerMonth',
      'linkExpiryDays','commissionPercent','withdrawalCount','withdrawalPeriod',
      'features','isHighlighted','isActive','displayOrder'];

    const update = { updatedAt: Date.now() };
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    await ref(`${DB_PATHS.PLANS}/${id}`).update(update);
    return response.success(res, 'Plan updated');
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

const adminDeletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await ref(`${DB_PATHS.PLANS}/${id}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Plan not found');
    if (snap.val().isDefault) return response.error(res, 'Cannot delete the default free plan.');
    await ref(`${DB_PATHS.PLANS}/${id}`).remove();
    return response.success(res, 'Plan deleted');
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

const adminAssignPlan = async (req, res) => {
  try {
    const { uid } = req.params;
    const { planId, durationDays } = req.body;

    const user = await firebaseService.getUser(uid);
    if (!user) return response.notFound(res, 'User not found');

    const plan = await subscriptionService.getPlan(planId) || DEFAULT_PLANS[planId];
    if (!plan) return response.notFound(res, 'Plan not found');

    const sub = await subscriptionService.activateSubscription(uid, planId, durationDays || 30);

    await notificationService.createNotification(uid, {
      title: '🎉 Plan Activated!',
      message: `Your ${plan.name} plan has been activated! Enjoy your upgraded features.`,
      type: 'subscription',
    });

    return response.success(res, `${plan.name} plan assigned`, { subscription: sub });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

const adminGetPaymentLinks = async (req, res) => {
  try {
    const snap = await ref(DB_PATHS.PAYMENT_LINKS).orderByChild('createdAt').limitToLast(200).once('value');
    const links = [];
    if (snap.exists()) snap.forEach(c => { links.push(c.val()); });
    return response.success(res, 'Payment links fetched', { links: links.reverse(), total: links.length });
  } catch (err) {
    return response.success(res, 'Payment links fetched', { links: [], total: 0 });
  }
};

const adminGetCommissionLogs = async (req, res) => {
  try {
    // Commission is now earned at withdrawal time (not at payment-receipt
    // time), so withdrawals — not the old commissionLogs table — are the
    // source of truth for commission reporting.
    const withdrawals = await firebaseService.getAllWithdrawals();
    const logs = withdrawals
      .filter((w) => w.commission > 0)
      .map((w) => ({
        userId: w.userId,
        withdrawalId: w.id,
        commission: w.commission,
        netAmount: w.netAmount,
        grossAmount: w.amount,
        status: w.status, // commission is only realized once status === 'approved'
        createdAt: w.createdAt,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const totalCommission = logs
      .filter((l) => l.status === 'approved')
      .reduce((s, l) => s + (l.commission || 0), 0);

    return response.success(res, 'Commission logs fetched', { logs, totalCommission });
  } catch (err) {
    return response.success(res, 'Commission logs fetched', { logs: [], totalCommission: 0 });
  }
};

const planValidation = [
  body('id').notEmpty().matches(/^[a-z0-9_]+$/),
  body('name').notEmpty().isLength({ max: 50 }),
  body('price').isFloat({ min: 0 }),
  body('walletLimit').isFloat({ min: 0 }),
  body('paymentLinksPerMonth').isInt({ min: -1 }),
  body('linkExpiryDays').isInt({ min: -1 }),
  body('commissionPercent').isFloat({ min: 0, max: 100 }),
  body('withdrawalCount').isInt({ min: 1 }),
];

module.exports = {
  getPlans, getMySubscription, purchasePlan, purchasePlanWithWallet,
  adminGetPlans, adminCreatePlan, adminUpdatePlan, adminDeletePlan,
  adminAssignPlan, adminGetPaymentLinks, adminGetCommissionLogs,
  planValidation,
};
