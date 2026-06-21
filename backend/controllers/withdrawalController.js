// controllers/withdrawalController.js - Withdrawal Controller
const { body, validationResult } = require('express-validator');
const firebaseService = require('../services/firebaseService');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const response = require('../helpers/response');
const logger = require('../utils/logger');
const subscriptionService = require('../services/subscriptionService');

/**
 * POST /api/withdrawal/request
 * Submit a withdrawal request
 */
const requestWithdrawal = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return response.error(res, 'Validation failed', 400, errors.array());
    }

    const { amount, upiId, accountName } = req.body;
    const userId = req.user.uid;
    // 'amount' is the NET amount the user wants to actually receive in hand.
    const netAmount = parseFloat(amount);

    // Get platform settings
    const settings = await firebaseService.getSettings();
    const sub = await subscriptionService.getUserSubscription(userId);
    const plan = sub.plan;
    const minWithdrawal = settings.minWithdrawal || 100;
    const commissionPercent = plan.commissionPercent ?? settings.commissionPercent ?? 5;

    if (settings.maintenanceMode) {
      return response.error(res, 'Withdrawal system under maintenance.', 503);
    }

    // Check minimum withdrawal (this is the NET amount the user receives)
    if (netAmount < minWithdrawal) {
      return response.error(res, `Minimum withdrawal amount is ₹${minWithdrawal}`);
    }

    // Commission is added ON TOP of what the user wants — e.g. ₹100 net at
    // 5% commission requires ₹105 held from the wallet (100 + 5).
    const commission     = Math.round((netAmount * commissionPercent) / 100 * 100) / 100;
    const requiredAmount = Math.round((netAmount + commission) * 100) / 100;

    // Check wallet balance against the REQUIRED (gross) amount, not net
    const balance = await walletService.getBalance(userId);
    if (balance < requiredAmount) {
      return response.error(
        res,
        `Insufficient balance. To withdraw ₹${netAmount}, you need ₹${requiredAmount} in your wallet (₹${netAmount} + ${commissionPercent}% commission = ₹${commission}). Available: ₹${balance.toFixed(2)}`
      );
    }

    // Check for pending withdrawal (1 pending at a time)
    const existingWithdrawals = await firebaseService.getUserWithdrawals(userId);
    const hasPending = existingWithdrawals.some((w) => w.status === 'pending');
    if (hasPending) {
      return response.error(res, 'You already have a pending withdrawal request. Please wait for it to be processed.');
    }

    // Hold the REQUIRED (gross) amount from the wallet
    try {
      await walletService.debitWallet(userId, requiredAmount, `Withdrawal request`);
    } catch (debitErr) {
      if (debitErr.message === 'INSUFFICIENT_BALANCE') {
        return response.error(res, 'Insufficient balance');
      }
      throw debitErr;
    }

    // Create withdrawal record — 'amount' = held/gross, 'netAmount' = what user receives
    const withdrawalId = await firebaseService.createWithdrawal(userId, {
      amount: requiredAmount,
      commission,
      netAmount,
      upiId: upiId.trim(),
      accountName: accountName?.trim() || '',
    });

    // Notify user
    await notificationService.createNotification(userId, {
      title: '📤 Withdrawal Request Submitted',
      message: `Your withdrawal request for ₹${netAmount} (₹${requiredAmount} held incl. ${commissionPercent}% commission) has been submitted and is under review.`,
      type: 'withdrawal',
    });

    await firebaseService.logActivity(userId, 'WITHDRAWAL_REQUEST', {
      withdrawalId,
      amount: requiredAmount,
      netAmount,
      upiId,
    });

    logger.info(`Withdrawal requested: ${withdrawalId} by ${userId} for ₹${netAmount} (held ₹${requiredAmount})`);

    return response.success(res, 'Withdrawal request submitted successfully', {
      withdrawalId,
      amount: requiredAmount,
      commission,
      netAmount,
      status: 'pending',
    });

  } catch (err) {
    logger.error('Withdrawal request error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/withdrawal/history
 * Get withdrawal history for current user
 */
const getWithdrawalHistory = async (req, res) => {
  try {
    const withdrawals = await firebaseService.getUserWithdrawals(req.user.uid);
    return response.success(res, 'Withdrawal history fetched', { withdrawals });
  } catch (err) {
    logger.error('Get withdrawal history error:', err.message);
    return response.serverError(res, err.message);
  }
};

const requestWithdrawalValidation = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 1 }).withMessage('Invalid amount'),
  body('upiId')
    .notEmpty().withMessage('UPI ID is required')
    .matches(/^[\w.-]+@[\w.-]+$/).withMessage('Invalid UPI ID format'),
  body('accountName')
    .optional()
    .isLength({ max: 100 }).withMessage('Account name too long')
    .trim().escape(),
];

module.exports = {
  requestWithdrawal,
  getWithdrawalHistory,
  requestWithdrawalValidation,
};
