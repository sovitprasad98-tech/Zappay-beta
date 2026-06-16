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
    const withdrawAmount = parseFloat(amount);

    // Get platform settings
    const settings = await firebaseService.getSettings();
    const sub = await subscriptionService.getUserSubscription(userId);
    const plan = sub.plan;
    const minWithdrawal = settings.minWithdrawal || 100;
    const commissionPercent = plan.commissionPercent ?? settings.commissionPercent ?? 5;

    if (settings.maintenanceMode) {
      return response.error(res, 'Withdrawal system under maintenance.', 503);
    }

    // Check minimum withdrawal
    if (withdrawAmount < minWithdrawal) {
      return response.error(res, `Minimum withdrawal amount is ₹${minWithdrawal}`);
    }

    // Check wallet balance
    const balance = await walletService.getBalance(userId);
    if (balance < withdrawAmount) {
      return response.error(res, `Insufficient wallet balance. Available: ₹${balance.toFixed(2)}`);
    }

    // Calculate commission
    const commission = Math.round((withdrawAmount * commissionPercent) / 100 * 100) / 100;
    const netAmount = Math.round((withdrawAmount - commission) * 100) / 100;

    // Check for pending withdrawal (1 pending at a time)
    const existingWithdrawals = await firebaseService.getUserWithdrawals(userId);
    const hasPending = existingWithdrawals.some((w) => w.status === 'pending');
    if (hasPending) {
      return response.error(res, 'You already have a pending withdrawal request. Please wait for it to be processed.');
    }

    // Debit wallet FIRST (holds the amount)
    try {
      await walletService.debitWallet(userId, withdrawAmount, `Withdrawal request`);
    } catch (debitErr) {
      if (debitErr.message === 'INSUFFICIENT_BALANCE') {
        return response.error(res, 'Insufficient balance');
      }
      throw debitErr;
    }

    // Create withdrawal record
    const withdrawalId = await firebaseService.createWithdrawal(userId, {
      amount: withdrawAmount,
      commission,
      netAmount,
      upiId: upiId.trim(),
      accountName: accountName?.trim() || '',
    });

    // Notify user
    await notificationService.createNotification(userId, {
      title: '📤 Withdrawal Request Submitted',
      message: `Your withdrawal request of ₹${withdrawAmount} (Net: ₹${netAmount} after ${commissionPercent}% commission) has been submitted and is under review.`,
      type: 'withdrawal',
    });

    await firebaseService.logActivity(userId, 'WITHDRAWAL_REQUEST', {
      withdrawalId,
      amount: withdrawAmount,
      netAmount,
      upiId,
    });

    logger.info(`Withdrawal requested: ${withdrawalId} by ${userId} for ₹${withdrawAmount}`);

    return response.success(res, 'Withdrawal request submitted successfully', {
      withdrawalId,
      amount: withdrawAmount,
      commission,
      netAmount,
      status: 'pending',
    });

  } catch (err) {
    logger.error('Withdrawal request error:', err.message);
    return response.serverError(res);
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
    return response.serverError(res);
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
