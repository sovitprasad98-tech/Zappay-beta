// controllers/adminController.js - Admin Panel Controller
const { body, validationResult } = require('express-validator');
const firebaseService = require('../services/firebaseService');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/**
 * GET /api/admin/dashboard
 * Dashboard analytics
 */
const getDashboard = async (req, res) => {
  try {
    const [users, payments, withdrawals, settings] = await Promise.all([
      firebaseService.getAllUsers(),
      firebaseService.getAllPayments(500),
      firebaseService.getAllWithdrawals(),
      firebaseService.getSettings(),
    ]);

    const totalUsers = users.filter((u) => u.role !== 'admin').length;
    const totalPayments = payments.filter((p) => p.status === 'success').length;
    const totalRevenue = payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + (p.payAmount || p.amount || 0), 0);
    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending').length;
    const totalWalletBalance = users.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

    // Last 7 days payments
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentPayments = payments.filter(
      (p) => p.status === 'success' && p.createdAt > sevenDaysAgo
    ).length;

    return response.success(res, 'Dashboard data fetched', {
      stats: {
        totalUsers,
        totalPayments,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        pendingWithdrawals,
        totalWalletBalance: Math.round(totalWalletBalance * 100) / 100,
        recentPayments,
      },
      settings,
    });
  } catch (err) {
    logger.error('Dashboard error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/admin/users
 */
const getUsers = async (req, res) => {
  try {
    const users = await firebaseService.getAllUsers();
    return response.success(res, 'Users fetched', { users, total: users.length });
  } catch (err) {
    logger.error('Get users error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/admin/users/:uid
 */
const getUserDetail = async (req, res) => {
  try {
    const user = await firebaseService.getUser(req.params.uid);
    if (!user) return response.notFound(res, 'User not found');

    const [payments, withdrawals] = await Promise.all([
      firebaseService.getUserPayments(req.params.uid, 20),
      firebaseService.getUserWithdrawals(req.params.uid),
    ]);

    return response.success(res, 'User detail fetched', { user, payments, withdrawals });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * POST /api/admin/users/:uid/ban
 */
const toggleBan = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await firebaseService.getUser(uid);
    if (!user) return response.notFound(res, 'User not found');

    const newBanStatus = !user.isBanned;
    await firebaseService.setBanStatus(uid, newBanStatus);

    const action = newBanStatus ? 'banned' : 'unbanned';
    logger.info(`User ${uid} ${action} by admin ${req.user.uid}`);

    await firebaseService.logActivity(req.user.uid, `USER_${action.toUpperCase()}`, { targetUid: uid });

    return response.success(res, `User ${action} successfully`, { isBanned: newBanStatus });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * POST /api/admin/wallet/adjust
 * Manual wallet credit or debit
 */
const adjustWallet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

    const { userId, amount, reason } = req.body;
    const adjustAmount = parseFloat(amount);

    const user = await firebaseService.getUser(userId);
    if (!user) return response.notFound(res, 'User not found');

    const newBalance = await walletService.adminAdjustWallet(userId, adjustAmount, reason || 'Admin adjustment');

    await notificationService.createNotification(userId, {
      title: adjustAmount > 0 ? '💰 Wallet Credited' : '💸 Wallet Debited',
      message: `${adjustAmount > 0 ? '₹' + adjustAmount + ' added to' : '₹' + Math.abs(adjustAmount) + ' deducted from'} your wallet by admin. Reason: ${reason || 'N/A'}`,
      type: 'general',
    });

    await firebaseService.logActivity(req.user.uid, 'ADMIN_WALLET_ADJUST', {
      targetUid: userId,
      amount: adjustAmount,
      reason,
    });

    return response.success(res, 'Wallet adjusted', { newBalance });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_BALANCE') {
      return response.error(res, 'User has insufficient balance for debit');
    }
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/admin/payments
 */
const getAllPayments = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const payments = await firebaseService.getAllPayments(limit);
    return response.success(res, 'Payments fetched', { payments, total: payments.length });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/admin/withdrawals
 */
const getAllWithdrawals = async (req, res) => {
  try {
    const withdrawals = await firebaseService.getAllWithdrawals();
    return response.success(res, 'Withdrawals fetched', { withdrawals });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * PUT /api/admin/withdrawals/:id/approve
 */
const approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await firebaseService.getWithdrawal(req.params.id);
    if (!withdrawal) return response.notFound(res, 'Withdrawal not found');
    if (withdrawal.status !== 'pending') {
      return response.error(res, `Withdrawal is already ${withdrawal.status}`);
    }

    await firebaseService.updateWithdrawalStatus(req.params.id, 'approved', req.body.note || '');

    await notificationService.notifyWithdrawalStatus(withdrawal.userId, withdrawal.netAmount, 'approved');

    await firebaseService.logActivity(req.user.uid, 'WITHDRAWAL_APPROVED', {
      withdrawalId: req.params.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
    });

    return response.success(res, 'Withdrawal approved successfully');
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * PUT /api/admin/withdrawals/:id/reject
 */
const rejectWithdrawal = async (req, res) => {
  try {
    const withdrawal = await firebaseService.getWithdrawal(req.params.id);
    if (!withdrawal) return response.notFound(res, 'Withdrawal not found');
    if (withdrawal.status !== 'pending') {
      return response.error(res, `Withdrawal is already ${withdrawal.status}`);
    }

    const note = req.body.note || 'Request rejected by admin';

    await firebaseService.updateWithdrawalStatus(req.params.id, 'rejected', note);

    // Refund wallet on rejection
    await walletService.creditWallet(withdrawal.userId, withdrawal.amount, 'Withdrawal refund');

    await notificationService.notifyWithdrawalStatus(withdrawal.userId, withdrawal.amount, 'rejected', note);

    await firebaseService.logActivity(req.user.uid, 'WITHDRAWAL_REJECTED', {
      withdrawalId: req.params.id,
      userId: withdrawal.userId,
      reason: note,
    });

    return response.success(res, 'Withdrawal rejected and amount refunded');
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/admin/settings
 */
const getSettings = async (req, res) => {
  try {
    const settings = await firebaseService.getSettings();
    return response.success(res, 'Settings fetched', { settings });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * PUT /api/admin/settings
 */
const updateSettings = async (req, res) => {
  try {
    const allowed = ['minWithdrawal', 'commissionPercent', 'maintenanceMode', 'siteName', 'supportEmail'];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    await firebaseService.updateSettings(update);
    await firebaseService.logActivity(req.user.uid, 'SETTINGS_UPDATED', update);

    return response.success(res, 'Settings updated');
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/**
 * POST /api/admin/notifications/send
 * Broadcast notification to all users
 */
const sendBroadcast = async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message) return response.error(res, 'Title and message required');

    const count = await notificationService.broadcastNotification({ title, message, type });

    return response.success(res, `Notification sent to ${count} users`);
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

const adjustWalletValidation = [
  body('userId').notEmpty().withMessage('User ID required'),
  body('amount').isFloat({ min: -100000, max: 100000 }).withMessage('Invalid amount'),
  body('reason').optional().isLength({ max: 200 }).trim().escape(),
];

module.exports = {
  getDashboard,
  getUsers,
  getUserDetail,
  toggleBan,
  adjustWallet,
  adjustWalletValidation,
  getAllPayments,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getSettings,
  updateSettings,
  sendBroadcast,
};
