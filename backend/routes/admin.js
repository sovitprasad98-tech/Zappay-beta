// routes/admin.js
const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

// Apply auth + admin check to ALL admin routes
router.use(authenticate, requireAdmin);

router.get('/dashboard', admin.getDashboard);
router.get('/users', admin.getUsers);
router.get('/users/:uid', admin.getUserDetail);
router.post('/users/:uid/ban', admin.toggleBan);
router.post('/wallet/adjust', admin.adjustWalletValidation, admin.adjustWallet);
router.get('/payments', admin.getAllPayments);
router.get('/withdrawals', admin.getAllWithdrawals);
router.put('/withdrawals/:id/approve', admin.approveWithdrawal);
router.put('/withdrawals/:id/reject', admin.rejectWithdrawal);
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/notifications/send', admin.sendBroadcast);

module.exports = router;
