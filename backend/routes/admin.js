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
router.post('/users/delete-unverified', admin.deleteUnverifiedUsers);
router.get('/users/:uid', admin.getUserDetail);
router.post('/users/:uid/ban', admin.toggleBan);
router.delete('/users/:uid', admin.deleteUser);
router.post('/wallet/adjust', admin.adjustWalletValidation, admin.adjustWallet);
router.get('/payments', admin.getAllPayments);
router.get('/withdrawals', admin.getAllWithdrawals);
router.put('/withdrawals/:id/approve', admin.approveWithdrawal);
router.put('/withdrawals/:id/reject', admin.rejectWithdrawal);
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/notifications/send', admin.sendBroadcast);
router.get('/referrals', admin.getAllReferrals);

module.exports = router;

// ── Subscription + Plan routes (admin only, already uses authenticate+requireAdmin) ──
const subCtrl = require('../controllers/subscriptionController');
const plCtrl  = require('../controllers/paymentLinkController');
const promoCtrl = require('../controllers/promoController');

router.get('/plans',                    subCtrl.adminGetPlans);
router.post('/plans',                   subCtrl.planValidation, subCtrl.adminCreatePlan);
router.put('/plans/:id',                subCtrl.adminUpdatePlan);
router.delete('/plans/:id',             subCtrl.adminDeletePlan);
router.post('/users/:uid/subscription', subCtrl.adminAssignPlan);
router.get('/payment-links',            subCtrl.adminGetPaymentLinks);
router.get('/commission-logs',          subCtrl.adminGetCommissionLogs);
router.get('/promo-codes',              promoCtrl.adminGetPromoCodes);
router.post('/promo-codes',             promoCtrl.adminCreatePromoCode);
router.put('/promo-codes/:code/toggle', promoCtrl.adminTogglePromoCode);
