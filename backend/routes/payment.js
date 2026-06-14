// routes/payment.js
const express = require('express');
const router = express.Router();
const { createOrder, getPaymentStatus, getPaymentHistory, createOrderValidation } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

router.post('/create-order', authenticate, paymentLimiter, createOrderValidation, createOrder);
router.get('/status/:orderId', authenticate, getPaymentStatus);
router.get('/history', authenticate, getPaymentHistory);

module.exports = router;
