// routes/wallet.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const walletService = require('../services/walletService');
const response = require('../helpers/response');

router.get('/balance', authenticate, async (req, res) => {
  try {
    const balance = await walletService.getBalance(req.user.uid);
    return response.success(res, 'Balance fetched', { balance });
  } catch (err) {
    return response.serverError(res, err.message);
  }
});

module.exports = router;
