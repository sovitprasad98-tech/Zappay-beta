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
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return response.error(res, 'Validation failed', 400, errors.array());

  try {
    await firebaseService.updateUserProfile(req.user.uid, req.body);
    return response.success(res, 'Profile updated successfully');
  } catch (err) {
    return response.serverError(res);
  }
});

module.exports = router;
