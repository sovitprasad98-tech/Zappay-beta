const express = require('express');
const router = express.Router();
const { googleAuth, getMe, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/google', authLimiter, googleAuth);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
