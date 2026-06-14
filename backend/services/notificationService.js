// services/notificationService.js - Notification System
const { ref, serverTimestamp } = require('../firebase/admin');
const { DB_PATHS, NOTIFICATION_TYPE } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Create a notification for a user
 */
async function createNotification(userId, { title, message, type = NOTIFICATION_TYPE.GENERAL }) {
  const notifRef = ref(`${DB_PATHS.NOTIFICATIONS}/${userId}`).push();
  await notifRef.set({
    id: notifRef.key,
    title,
    message,
    type,
    isRead: false,
    createdAt: serverTimestamp(),
  });
  return notifRef.key;
}

/**
 * Get notifications for a user
 */
async function getUserNotifications(userId, limit = 30) {
  const snap = await ref(`${DB_PATHS.NOTIFICATIONS}/${userId}`)
    .orderByChild('createdAt')
    .limitToLast(limit)
    .once('value');

  if (!snap.exists()) return [];
  const notifs = [];
  snap.forEach((child) => notifs.push(child.val()));
  return notifs.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Mark notification as read
 */
async function markAsRead(userId, notifId) {
  await ref(`${DB_PATHS.NOTIFICATIONS}/${userId}/${notifId}`).update({
    isRead: true,
  });
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(userId) {
  const snap = await ref(`${DB_PATHS.NOTIFICATIONS}/${userId}`)
    .orderByChild('isRead')
    .equalTo(false)
    .once('value');

  if (!snap.exists()) return;
  const updates = {};
  snap.forEach((child) => {
    updates[`${child.key}/isRead`] = true;
  });
  await ref(`${DB_PATHS.NOTIFICATIONS}/${userId}`).update(updates);
}

/**
 * Get unread notification count
 */
async function getUnreadCount(userId) {
  const snap = await ref(`${DB_PATHS.NOTIFICATIONS}/${userId}`)
    .orderByChild('isRead')
    .equalTo(false)
    .once('value');
  return snap.numChildren();
}

/**
 * Send notification to all users (admin broadcast)
 */
async function broadcastNotification({ title, message, type = NOTIFICATION_TYPE.GENERAL }) {
  const usersSnap = await ref(DB_PATHS.USERS).once('value');
  if (!usersSnap.exists()) return 0;

  let count = 0;
  const promises = [];

  usersSnap.forEach((child) => {
    const uid = child.key;
    const user = child.val();
    if (!user.isBanned && user.role !== 'admin') {
      promises.push(createNotification(uid, { title, message, type }));
      count++;
    }
  });

  await Promise.all(promises);
  logger.info(`Broadcast sent to ${count} users: ${title}`);
  return count;
}

/**
 * Payment success notification
 */
async function notifyPaymentSuccess(userId, amount, orderId) {
  return createNotification(userId, {
    title: '💰 Payment Received',
    message: `₹${amount} has been added to your wallet. Order: ${orderId}`,
    type: NOTIFICATION_TYPE.PAYMENT,
  });
}

/**
 * Withdrawal status notification
 */
async function notifyWithdrawalStatus(userId, amount, status, adminNote = '') {
  const isApproved = status === 'approved';
  return createNotification(userId, {
    title: isApproved ? '✅ Withdrawal Approved' : '❌ Withdrawal Rejected',
    message: isApproved
      ? `Your withdrawal request of ₹${amount} has been approved and will be processed soon.`
      : `Your withdrawal request of ₹${amount} was rejected. ${adminNote ? 'Reason: ' + adminNote : ''}`,
    type: NOTIFICATION_TYPE.WITHDRAWAL,
  });
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  broadcastNotification,
  notifyPaymentSuccess,
  notifyWithdrawalStatus,
};
