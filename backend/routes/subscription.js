// routes/subscription.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

router.get('/plans',    ctrl.getPlans);                          // public
router.get('/my',       authenticate, ctrl.getMySubscription);   // auth
router.post('/purchase', authenticate, paymentLimiter, ctrl.purchasePlan); // auth
router.post('/purchase-wallet', authenticate, paymentLimiter, ctrl.purchasePlanWithWallet); // auth

module.exports = router;
