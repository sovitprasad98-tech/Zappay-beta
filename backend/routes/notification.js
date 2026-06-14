// routes/notification.js
const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, getUnreadCount } = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.get('/list', authenticate, getNotifications);
router.get('/count', authenticate, getUnreadCount);
router.put('/read/:id', authenticate, markAsRead);
router.put('/read-all', authenticate, markAllAsRead);

module.exports = router;
