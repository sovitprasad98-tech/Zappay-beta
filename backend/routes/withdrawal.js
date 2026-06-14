// routes/withdrawal.js
const express = require('express');
const router = express.Router();
const { requestWithdrawal, getWithdrawalHistory, requestWithdrawalValidation } = require('../controllers/withdrawalController');
const { authenticate } = require('../middleware/auth');
const { withdrawalLimiter } = require('../middleware/rateLimiter');

router.post('/request', authenticate, withdrawalLimiter, requestWithdrawalValidation, requestWithdrawal);
router.get('/history', authenticate, getWithdrawalHistory);

module.exports = router;
