// routes/subscription.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');

router.get('/plans', ctrl.getPlans);                        // public
router.get('/my', authenticate, ctrl.getMySubscription);    // auth required

module.exports = router;
