// config/constants.js - Application Constants

module.exports = {
  // User roles
  ROLES: {
    USER: 'user',
    ADMIN: 'admin',
  },

  // Payment statuses
  PAYMENT_STATUS: {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
    TIMEOUT: 'timeout',
  },

  // Withdrawal statuses
  WITHDRAWAL_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  },

  // Notification types
  NOTIFICATION_TYPE: {
    PAYMENT: 'payment',
    WITHDRAWAL: 'withdrawal',
    GENERAL: 'general',
    SYSTEM: 'system',
  },

  // Firebase RTDB paths
  DB_PATHS: {
    USERS: 'users',
    PAYMENTS: 'payments',
    WITHDRAWALS: 'withdrawals',
    NOTIFICATIONS: 'notifications',
    SETTINGS: 'settings',
    PROCESSED_ORDERS: 'processedOrders',
    ACTIVITY_LOGS: 'activityLogs',
  },

  // JWT
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',

  // Zap UPI
  ZAP_API_URL: process.env.ZAP_API_URL || 'https://pay.zapupi.com/api',
  ZAP_SUCCESS_REDIRECT: '/payment-success.php',
  ZAP_FAILED_REDIRECT: '/payment-failed.php',
  ZAP_TIMEOUT_REDIRECT: '/payment-failed.php',

  // Default platform settings
  DEFAULT_SETTINGS: {
    minWithdrawal: 100,
    commissionPercent: 5,
    maintenanceMode: false,
    siteName: 'ZapPay',
    supportEmail: 'support@zappay.in',
  },
};
