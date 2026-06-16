// controllers/paymentLinkController.js
const { body, validationResult } = require('express-validator');
const { ref } = require('../firebase/admin');
const zapService = require('../services/zapService');
const firebaseService = require('../services/firebaseService');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const response = require('../helpers/response');
const logger = require('../utils/logger');
const { DB_PATHS } = require('../config/constants');
const crypto = require('crypto');

/** Generate a short unique link ID */
function generateLinkId() {
  return crypto.randomBytes(4).toString('hex'); // e.g. "a1b2c3d4"
}

/**
 * POST /api/payment-link/create
 * Create a new shareable payment link
 */
const createPaymentLink = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

    const { amount, title, description } = req.body;
    const userId = req.user.uid;

    // 1. Get user's subscription + plan
    const sub = await subscriptionService.getUserSubscription(userId);
    const plan = sub.plan;

    if (!plan) return response.error(res, 'Could not load your plan. Try again.');

    // 2. Check monthly link limit
    await subscriptionService.checkAndResetMonthlyLinks(userId);
    const linksUsed = sub.paymentLinksUsedThisMonth || 0;
    if (plan.paymentLinksPerMonth !== -1 && linksUsed >= plan.paymentLinksPerMonth) {
      return response.error(res,
        `You've used all ${plan.paymentLinksPerMonth} payment links this month. Upgrade your plan for more.`
      );
    }

    // 3. Check wallet limit
    const balance = await walletService.getBalance(userId);
    if (balance >= plan.walletLimit) {
      return response.error(res,
        `Your wallet has reached its limit of ₹${plan.walletLimit}. Withdraw funds to create new links.`
      );
    }

    // 4. Generate unique link ID
    let linkId = generateLinkId();
    // Ensure uniqueness
    let exists = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');
    while (exists.exists()) {
      linkId = generateLinkId();
      exists = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');
    }

    // 5. Calculate expiry
    const expiresAt = plan.linkExpiryDays > 0
      ? Date.now() + plan.linkExpiryDays * 24 * 60 * 60 * 1000
      : null; // null = never expires

    // 6. Get user info for merchant name
    const user = await firebaseService.getUser(userId);

    // 7. Save to Firebase
    const linkData = {
      id: linkId,
      userId,
      merchantName: user?.displayName || 'Merchant',
      title: title.trim(),
      description: description?.trim() || '',
      amount: parseFloat(amount),
      status: 'active',
      expiresAt,
      planId: plan.id,
      planName: plan.name,
      commissionPercent: plan.commissionPercent,
      createdAt: Date.now(),
      paidAt: null,
      paymentCount: 0,
      totalCollected: 0,
    };

    await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).set(linkData);

    // 8. Increment monthly count
    await subscriptionService.incrementLinkCount(userId);

    // 9. Build public URL
    const publicUrl = `${process.env.FRONTEND_URL}/pay.php?id=${linkId}`;

    logger.info(`Payment link created: ${linkId} by ${userId}`);

    return response.success(res, 'Payment link created!', {
      linkId,
      publicUrl,
      amount: linkData.amount,
      title: linkData.title,
      expiresAt,
      linksRemaining: plan.paymentLinksPerMonth === -1
        ? 'Unlimited'
        : plan.paymentLinksPerMonth - linksUsed - 1,
    });

  } catch (err) {
    logger.error('Create payment link error:', err.message);
    return response.serverError(res);
  }
};

/**
 * GET /api/payment-link/list
 * Get all payment links for current user
 */
const getUserLinks = async (req, res) => {
  try {
    const snap = await ref(DB_PATHS.PAYMENT_LINKS)
      .orderByChild('userId')
      .equalTo(req.user.uid)
      .once('value');

    const links = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        const link = child.val();
        // Mark expired ones
        if (link.expiresAt && Date.now() > link.expiresAt && link.status === 'active') {
          link.status = 'expired';
        }
        links.push(link);
      });
    }

    links.sort((a, b) => b.createdAt - a.createdAt);
    return response.success(res, 'Links fetched', { links, total: links.length });
  } catch (err) {
    logger.error('Get user links error:', err.message);
    return response.serverError(res);
  }
};

/**
 * GET /api/payment-link/:linkId/public
 * Public endpoint — get link details for customer payment page (NO AUTH)
 */
const getLinkPublic = async (req, res) => {
  try {
    const { linkId } = req.params;
    const snap = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');

    if (!snap.exists()) return response.notFound(res, 'Payment link not found');

    const link = snap.val();

    // Check status
    if (link.status === 'disabled') return response.error(res, 'This payment link has been disabled by the merchant.');
    if (link.expiresAt && Date.now() > link.expiresAt) {
      return response.error(res, 'This payment link has expired.');
    }

    // Check merchant account is still active
    const merchant = await firebaseService.getUser(link.userId);
    if (!merchant || merchant.isBanned) {
      return response.error(res, 'This payment link is no longer available.');
    }

    // Return safe public fields only
    return response.success(res, 'Link details fetched', {
      linkId: link.id,
      merchantName: link.merchantName,
      title: link.title,
      description: link.description,
      amount: link.amount,
      expiresAt: link.expiresAt,
      status: link.status,
    });
  } catch (err) {
    logger.error('Get link public error:', err.message);
    return response.serverError(res);
  }
};

/**
 * POST /api/payment-link/:linkId/initiate
 * Customer clicks "Pay Now" — creates Zap UPI order for this payment link
 */
const initiatePayment = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { customerMobile, customerName } = req.body;

    const snap = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Payment link not found');

    const link = snap.val();

    // Validations
    if (link.status === 'disabled') return response.error(res, 'This payment link is disabled.');
    if (link.expiresAt && Date.now() > link.expiresAt) return response.error(res, 'This payment link has expired.');

    // Check merchant wallet limit
    const merchantSub = await subscriptionService.getUserSubscription(link.userId);
    const plan = merchantSub.plan;
    const balance = await walletService.getBalance(link.userId);
    const netAmount = link.amount * (1 - (link.commissionPercent || plan.commissionPercent) / 100);

    if (balance + netAmount > plan.walletLimit) {
      return response.error(res, 'Merchant wallet is full. Please contact the merchant.');
    }

    // Check maintenance
    const settings = await firebaseService.getSettings();
    if (settings.maintenanceMode) return response.error(res, 'Payment system under maintenance.', 503);

    // Generate Zap order ID
    const orderId = zapService.generateOrderId(link.userId);

    // Save payment record (tags it as a link payment)
    await firebaseService.createPayment(orderId, {
      userId: link.userId,
      amount: link.amount,
      remark: `${link.title} | LinkID:${linkId}`,
      customerMobile: customerMobile || '',
      linkId,
    });

    // Update link with pending order
    await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).update({
      lastOrderId: orderId,
      lastCustomerName: customerName || '',
      lastCustomerMobile: customerMobile || '',
    });

    // Create Zap UPI order
    const zapOrder = await zapService.createOrder({
      orderId,
      amount: String(link.amount.toFixed(2)),
      customerMobile: customerMobile || '',
      remark: link.title,
    });

    return response.success(res, 'Payment initiated', {
      paymentUrl: zapOrder.paymentUrl,
      orderId,
      amount: link.amount,
    });

  } catch (err) {
    logger.error('Initiate link payment error:', err.message);
    return response.serverError(res);
  }
};

/**
 * PUT /api/payment-link/:linkId/disable
 * Merchant disables their own payment link
 */
const disableLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const snap = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Link not found');

    if (snap.val().userId !== req.user.uid) return response.forbidden(res);

    await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).update({ status: 'disabled' });
    return response.success(res, 'Payment link disabled');
  } catch (err) {
    return response.serverError(res);
  }
};

/**
 * PUT /api/payment-link/:linkId/enable
 */
const enableLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const snap = await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).once('value');
    if (!snap.exists()) return response.notFound(res, 'Link not found');

    const link = snap.val();
    if (link.userId !== req.user.uid) return response.forbidden(res);
    if (link.expiresAt && Date.now() > link.expiresAt) {
      return response.error(res, 'Cannot re-enable an expired link.');
    }

    await ref(`${DB_PATHS.PAYMENT_LINKS}/${linkId}`).update({ status: 'active' });
    return response.success(res, 'Payment link enabled');
  } catch (err) {
    return response.serverError(res);
  }
};

const createLinkValidation = [
  body('amount').isFloat({ min: 1, max: 100000 }).withMessage('Amount must be between ₹1–₹1,00,000'),
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 80 }).trim(),
  body('description').optional().isLength({ max: 300 }).trim().escape(),
];

module.exports = {
  createPaymentLink,
  getUserLinks,
  getLinkPublic,
  initiatePayment,
  disableLink,
  enableLink,
  createLinkValidation,
};
