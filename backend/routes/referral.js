// routes/referral.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/referralController');
const { authenticate } = require('../middleware/auth');

router.get('/my', authenticate, ctrl.getMyReferral);

module.exports = router;
