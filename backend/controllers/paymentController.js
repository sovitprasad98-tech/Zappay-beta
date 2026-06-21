// controllers/paymentController.js - Payment Controller
const { body, validationResult } = require('express-validator');
const zapService = require('../services/zapService');
const firebaseService = require('../services/firebaseService');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/**
 * Validation rules for creating an order
 */
const createOrderValidation = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 1, max: 100000 }).withMessage('Amount must be between ₹1 and ₹1,00,000'),
  body('remark')
    .optional()
    .isLength({ max: 100 }).withMessage('Remark must be under 100 characters')
    .trim()
    .escape(),
  body('customerMobile')
    .optional()
    .isMobilePhone('en-IN').withMessage('Invalid mobile number'),
];

/**
 * POST /api/payment/create-order
 * Create a Zap UPI payment order
 */
const createOrder = async (req, res) => {
  try {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 'Validation failed', 400, errors.array());
    }

    const { amount, remark, customerMobile, type } = req.body;
    const userId = req.user.uid;

    // Check maintenance mode
    const settings = await firebaseService.getSettings();
    if (settings.maintenanceMode) {
      return response.error(res, 'Payment system is under maintenance.', 503);
    }

    // Check if user is active
    const user = await firebaseService.getUser(userId);
    if (!user || user.isBanned) {
      return response.forbidden(res, 'Account is not active');
    }

    // Generate unique order ID
    const orderId = zapService.generateOrderId(userId);

    // Include userId in remark for webhook tracking
    const fullRemark = remark
      ? `${remark} | ${userId}`
      : `ZapPay | ${userId}`;

    // Create order record in DB FIRST (before calling Zap API)
    await firebaseService.createPayment(orderId, {
      userId,
      amount: parseFloat(amount),
      remark: fullRemark,
      customerMobile: customerMobile || user.phone || '',
      type: type === 'wallet_topup' ? 'wallet_topup' : 'quick_link',
    });

    // Call Zap UPI API (backend only - ZAP_KEY never exposed to frontend)
    const zapOrder = await zapService.createOrder({
      orderId,
      amount: String(parseFloat(amount).toFixed(2)),
      customerMobile: customerMobile || user.phone || '',
      remark: fullRemark,
    });

    logger.info(`Order created: ${orderId} by user ${userId} for ₹${amount}`);

    // Return payment URL to frontend (NOT the zap_key)
    return response.success(res, 'Order created successfully', {
      orderId: zapOrder.orderId,
      paymentUrl: zapOrder.paymentUrl,
      amount: parseFloat(amount),
    });

  } catch (err) {
    logger.error('Create order error:', err.message);
    return response.error(res, err.message || 'Failed to create payment order');
  }
};

/**
 * GET /api/payment/status/:orderId
 * Get payment status (from DB + optional API check)
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) return response.error(res, 'Order ID required');

    const payment = await firebaseService.getPayment(orderId);
    if (!payment) return response.notFound(res, 'Payment not found');

    // Only show payment to its owner (or admin)
    if (payment.userId !== req.user.uid && req.user.role !== 'admin') {
      return response.forbidden(res);
    }

    return response.success(res, 'Payment status fetched', {
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      type: payment.type,
      planId: payment.planId,
      txnId: payment.txnId || '',
      utr: payment.utr || '',
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  } catch (err) {
    logger.error('Get payment status error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/payment/history
 * Get payment history for current user
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.uid;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const payments = await firebaseService.getUserPayments(userId, limit);

    return response.success(res, 'Payment history fetched', { payments, total: payments.length });
  } catch (err) {
    logger.error('Get payment history error:', err.message);
    return response.serverError(res, err.message);
  }
};

module.exports = {
  createOrder,
  getPaymentStatus,
  getPaymentHistory,
  createOrderValidation,
};
