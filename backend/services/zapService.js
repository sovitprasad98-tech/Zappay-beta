// services/zapService.js - Zap UPI Gateway API Service
// CRITICAL: This file must NEVER be exposed to frontend
const axios = require('axios');
const logger = require('../utils/logger');

const ZAP_API_URL = process.env.ZAP_API_URL || 'https://pay.zapupi.com/api';
const ZAP_KEY = process.env.ZAP_KEY;

/**
 * Sanitize remark for Zap UPI gateway.
 * UPI/payment gateways reject remarks containing emoji or non-ASCII
 * characters (e.g. plan names like "🥉 Bronze" cause "Invalid Remark").
 * Strips everything except letters, numbers, spaces and basic punctuation,
 * collapses whitespace, and falls back to a safe default if empty.
 */
function sanitizeRemark(text) {
  if (!text) return 'ZapPay Payment';
  const cleaned = String(text)
    .replace(/[^\x20-\x7E]/g, '')      // strip emoji & all non-ASCII chars
    .replace(/[^a-zA-Z0-9 .,\-_|:()]/g, '') // keep only safe punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'ZapPay Payment').slice(0, 50);
}

/**
 * Create a payment order with Zap UPI
 * @param {Object} params
 * @param {string} params.orderId - Unique order ID
 * @param {string} params.amount - Amount in INR
 * @param {string} [params.customerMobile] - Optional customer mobile
 * @param {string} [params.remark] - Optional remark
 */
async function createOrder({ orderId, amount, customerMobile, remark }) {
  if (!ZAP_KEY) {
    throw new Error('ZAP_KEY not configured');
  }

  const payload = {
    zap_key: ZAP_KEY,
    order_id: orderId,
    amount: String(amount),
    remark: sanitizeRemark(remark),
    success_url: `${process.env.FRONTEND_URL}/payment-success.php`,
    failed_url: `${process.env.FRONTEND_URL}/payment-failed.php`,
    timeout_url: `${process.env.FRONTEND_URL}/payment-failed.php`,
  };

  // Add optional fields
  if (customerMobile) payload.customer_mobile = customerMobile;

  // Add webhook URL if configured
  if (process.env.WEBHOOK_URL) {
    payload.webhook_url = process.env.WEBHOOK_URL;
  }

  logger.info(`Creating Zap order: ${orderId}, Amount: ₹${amount}, Remark: ${payload.remark}`);

  const response = await axios.post(`${ZAP_API_URL}/create-order`, payload, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  const data = response.data;

  if (data.status !== 'success' && !data.payment_url) {
    throw new Error(data.message || 'Failed to create payment order');
  }

  return {
    paymentUrl: data.payment_url,
    orderId: data.order_id || orderId,
    status: data.status,
  };
}

/**
 * Check order payment status
 * @param {string} orderId - Order ID to check
 */
async function getOrderStatus(orderId) {
  if (!ZAP_KEY) {
    throw new Error('ZAP_KEY not configured');
  }

  const response = await axios.post(
    `${ZAP_API_URL}/order-status`,
    { zap_key: ZAP_KEY, order_id: orderId },
    { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
  );

  const data = response.data;

  if (data.status !== 'success') {
    throw new Error(data.message || 'Failed to fetch order status');
  }

  return data.data || data;
}

/**
 * Generate a unique order ID
 */
function generateOrderId(userId) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ZP${timestamp}${suffix}`;
}

module.exports = {
  createOrder,
  getOrderStatus,
  generateOrderId,
};
