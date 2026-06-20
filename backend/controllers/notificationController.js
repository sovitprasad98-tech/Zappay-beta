// controllers/notificationController.js - Notification Controller
const notificationService = require('../services/notificationService');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/**
 * GET /api/notification/list
 * Get user notifications
 */
const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);
    const notifications = await notificationService.getUserNotifications(req.user.uid, limit);
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return response.success(res, 'Notifications fetched', { notifications, unreadCount });
  } catch (err) {
    logger.error('Get notifications error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * PUT /api/notification/read/:id
 * Mark a notification as read
 */
const markAsRead = async (req, res) => {
  try {
    await notificationService.markAsRead(req.user.uid, req.params.id);
    return response.success(res, 'Notification marked as read');
  } catch (err) {
    logger.error('Mark read error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * PUT /api/notification/read-all
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user.uid);
    return response.success(res, 'All notifications marked as read');
  } catch (err) {
    logger.error('Mark all read error:', err.message);
    return response.serverError(res, err.message);
  }
};

/**
 * GET /api/notification/count
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.uid);
    return response.success(res, 'Count fetched', { unreadCount: count });
  } catch (err) {
    return response.success(res, 'Count fetched', { unreadCount: 0 });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, getUnreadCount };
