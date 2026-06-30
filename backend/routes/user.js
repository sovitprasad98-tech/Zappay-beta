// routes/user.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const firebaseService = require('../services/firebaseService');
const response = require('../helpers/response');
const { body, validationResult } = require('express-validator');

// PUT /api/user/profile
router.put('/profile', authenticate, [
  body('displayName').optional().isLength({ max: 60 }).trim().escape(),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Invalid phone number'),
  body('upiId').optional().matches(/^[\w.-]+@[\w.-]+$/).withMessage('Invalid UPI ID'),
  body('upiHolderName').optional({ checkFalsy: true }).isLength({ max: 100 }).trim().escape(),
  body('bankDetails').optional().isObject().withMessage('Invalid bank details'),
  body('bankDetails.accountNumber').optional({ checkFalsy: true }).matches(/^\d{9,18}$/).withMessage('Invalid account number'),
  body('bankDetails.ifscCode').optional({ checkFalsy: true }).matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i).withMessage('Invalid IFSC code'),
  body('bankDetails.accountHolderName').optional({ checkFalsy: true }).isLength({ max: 100 }).trim().escape(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

  try {
    await firebaseService.updateUserProfile(req.user.uid, req.body);
    return response.success(res, 'Profile updated successfully');
  } catch (err) {
    return response.serverError(res, err.message);
  }
});

module.exports = router;
