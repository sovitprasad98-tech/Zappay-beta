// controllers/subscriptionController.js
const subscriptionService = require('../services/subscriptionService');
const firebaseService = require('../services/firebaseService');
const notificationService = require('../services/notificationService');
const { ref } = require('../firebase/admin');
const { DB_PATHS } = require('../config/constants');
const response = require('../helpers/response');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');

/** GET /api/subscription/plans — public */
const getPlans = async (req, res) => {
  try {
    const plans = await subscriptionService.getAllPlans();
    return response.success(res, 'Plans fetched', { plans });
  } catch (err) {
    return response.serverError(res);
  }
};

/** GET /api/subscription/my — current user subscription */
const getMySubscription = async (req, res) => {
  try {
    const sub = await subscriptionService.getUserSubscription(req.user.uid);
    return response.success(res, 'Subscription fetched', { subscription: sub });
  } catch (err) {
    return response.serverError(res);
  }
};

// ─── Admin Plan Management ───────────────────────────────────────

/** GET /api/admin/plans */
const adminGetPlans = async (req, res) => {
  try {
    const plans = await subscriptionService.getAllPlansAdmin();
    return response.success(res, 'All plans fetched', { plans });
  } catch (err) {
    return response.serverError(res);
  }
};

/** POST /api/admin/plans — Create new plan */
const adminCreatePlan = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

    const { id, name, badge, price, walletLimit, paymentLinksPerMonth,
      linkExpiryDays, commissionPercent, withdrawalCount, withdrawalPeriod,
      features, isHighlighted, displayOrder } = req.body;

    // Check ID not taken
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
      isDefault: false,
      isActive: true,
      displayOrder: parseInt(displayOrder) || 99,
      createdAt: Date.now(),
    };

    await ref(`${DB_PATHS.PLANS}/${id}`).set(plan);
    logger.info(`Plan created: ${id} by admin ${req.user.uid}`);
    return response.success(res, 'Plan created', { plan }, 201);
  } catch (err) {
    return response.serverError(res);
  }
};

/** PUT /api/admin/plans/:id — Update plan */
const adminUpdatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await ref(`${DB_PATHS.PLANS}/${id}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Plan not found');

    const allowed = ['name','badge','price','walletLimit','paymentLinksPerMonth',
      'linkExpiryDays','commissionPercent','withdrawalCount','withdrawalPeriod',
      'features','isHighlighted','isActive','displayOrder'];

    const update = { updatedAt: Date.now() };
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    await ref(`${DB_PATHS.PLANS}/${id}`).update(update);
    logger.info(`Plan updated: ${id}`);
    return response.success(res, 'Plan updated');
  } catch (err) {
    return response.serverError(res);
  }
};

/** DELETE /api/admin/plans/:id */
const adminDeletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await ref(`${DB_PATHS.PLANS}/${id}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Plan not found');
    if (snap.val().isDefault) return response.error(res, 'Cannot delete the default free plan.');

    await ref(`${DB_PATHS.PLANS}/${id}`).remove();
    return response.success(res, 'Plan deleted');
  } catch (err) {
    return response.serverError(res);
  }
};

/** POST /api/admin/users/:uid/subscription — Manually assign plan to user */
const adminAssignPlan = async (req, res) => {
  try {
    const { uid } = req.params;
    const { planId, durationDays } = req.body;

    const user = await firebaseService.getUser(uid);
    if (!user) return response.notFound(res, 'User not found');

    const plan = await subscriptionService.getPlan(planId);
    if (!plan) return response.notFound(res, 'Plan not found');

    const sub = await subscriptionService.activateSubscription(uid, planId, durationDays || 30);

    await notificationService.createNotification(uid, {
      title: '🎉 Plan Activated!',
      message: `Your ${plan.name} plan has been activated by admin. Enjoy your upgraded features!`,
      type: 'subscription',
    });

    await firebaseService.logActivity(req.user.uid, 'ADMIN_ASSIGN_PLAN', { targetUid: uid, planId });
    return response.success(res, `${plan.name} plan assigned to user`, { subscription: sub });
  } catch (err) {
    return response.serverError(res);
  }
};

/** GET /api/admin/payment-links — All payment links */
const adminGetPaymentLinks = async (req, res) => {
  try {
    const snap = await ref(DB_PATHS.PAYMENT_LINKS).orderByChild('createdAt').limitToLast(200).once('value');
    const links = [];
    if (snap.exists()) {
      snap.forEach((child) => links.push(child.val()));
    }
    return response.success(res, 'Payment links fetched', { links: links.reverse(), total: links.length });
  } catch (err) {
    return response.serverError(res);
  }
};

/** GET /api/admin/commission-logs */
const adminGetCommissionLogs = async (req, res) => {
  try {
    const snap = await ref(DB_PATHS.COMMISSION_LOGS).orderByChild('createdAt').limitToLast(200).once('value');
    const logs = [];
    if (snap.exists()) {
      snap.forEach((child) => logs.push(child.val()));
    }
    const totalCommission = logs.reduce((s, l) => s + (l.commission || 0), 0);
    return response.success(res, 'Commission logs fetched', { logs: logs.reverse(), totalCommission });
  } catch (err) {
    return response.serverError(res);
  }
};

const planValidation = [
  body('id').notEmpty().matches(/^[a-z0-9_]+$/).withMessage('ID must be lowercase alphanumeric'),
  body('name').notEmpty().isLength({ max: 50 }),
  body('price').isFloat({ min: 0 }),
  body('walletLimit').isFloat({ min: 0 }),
  body('paymentLinksPerMonth').isInt({ min: -1 }),
  body('linkExpiryDays').isInt({ min: -1 }),
  body('commissionPercent').isFloat({ min: 0, max: 100 }),
  body('withdrawalCount').isInt({ min: 1 }),
];

module.exports = {
  getPlans,
  getMySubscription,
  adminGetPlans,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
  adminAssignPlan,
  adminGetPaymentLinks,
  adminGetCommissionLogs,
  planValidation,
};
