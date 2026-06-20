// routes/paymentLink.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentLinkController');
const { authenticate } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');

// Public
router.get('/:linkId/public', ctrl.getLinkPublic);
router.get('/order/:orderId/status', ctrl.getLinkOrderStatus);
router.post('/:linkId/initiate', paymentLimiter, ctrl.initiatePayment);

// Authenticated (merchant)
router.post('/create', authenticate, paymentLimiter, ctrl.createLinkValidation, ctrl.createPaymentLink);
router.get('/list', authenticate, ctrl.getUserLinks);
router.put('/:linkId/disable', authenticate, ctrl.disableLink);
router.put('/:linkId/enable', authenticate, ctrl.enableLink);

module.exports = router;
