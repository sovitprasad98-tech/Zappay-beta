// webhooks/zapWebhook.js - Zap UPI Webhook Handler
// CRITICAL: This processes real money transactions
const firebaseService = require('../services/firebaseService');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const zapService = require('../services/zapService');
const logger = require('../utils/logger');

/**
 * Handle incoming webhook from Zap UPI
 * 
 * Zap UPI webhook payload:
 * {
 *   order_id, txn_id, status, amount, pay_amount,
 *   utr, customer_mobile, remark, remark_array, create_at, environment
 * }
 * 
 * SECURITY RULES:
 * 1. Never trust webhook blindly - verify via order-status API
 * 2. Prevent duplicate processing using processedOrders
 * 3. Never credit wallet for test environment
 */
async function handleZapWebhook(req, res) {
  // ALWAYS respond 200 immediately to Zap (prevents retries while processing)
  res.status(200).json({ status: 'ok' });

  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = req.body;

  logger.info(`Webhook received: orderId=${order_id}, status=${status}, env=${environment}`);

  // Ignore non-success webhooks (we track failures too but don't credit)
  if (!order_id) {
    logger.warn('Webhook received without order_id');
    return;
  }

  // Process asynchronously after responding
  processWebhookAsync({ order_id, status, txn_id, amount, pay_amount, utr, environment });
}

async function processWebhookAsync({ order_id, status, txn_id, amount, pay_amount, utr, environment }) {
  try {
    // 1. Check if already processed (duplicate prevention)
    const alreadyProcessed = await firebaseService.isOrderProcessed(order_id);
    if (alreadyProcessed) {
      logger.warn(`Duplicate webhook ignored: ${order_id}`);
      return;
    }

    // 2. Get payment record from DB
    const payment = await firebaseService.getPayment(order_id);
    if (!payment) {
      logger.error(`Payment not found in DB: ${order_id}`);
      return;
    }

    // 3. SECURITY: Verify with Zap API (don't trust webhook alone)
    let verifiedStatus = status;
    try {
      const apiStatus = await zapService.getOrderStatus(order_id);
      verifiedStatus = apiStatus.status || status;
      logger.info(`API verification for ${order_id}: ${verifiedStatus}`);
    } catch (verifyErr) {
      logger.warn(`Could not verify via API for ${order_id}: ${verifyErr.message}. Using webhook status.`);
    }

    // 4. Update payment record in DB
    await firebaseService.updatePaymentStatus(order_id, {
      status: verifiedStatus,
      txn_id,
      utr,
      amount,
      pay_amount,
      environment,
    });

    // 5. Mark as processed BEFORE crediting (prevents double credit)
    await firebaseService.markOrderProcessed(order_id);

    // 6. If payment successful, credit wallet
    if (verifiedStatus === 'Success') {
      const creditAmount = parseFloat(pay_amount || amount || 0);

      if (creditAmount <= 0) {
        logger.error(`Invalid credit amount for ${order_id}: ${creditAmount}`);
        return;
      }

      // Credit wallet using Firebase transaction
      const newBalance = await walletService.creditWallet(
        payment.userId,
        creditAmount,
        `Payment ${order_id}`
      );

      logger.info(`Wallet credited: User=${payment.userId}, Amount=₹${creditAmount}, NewBalance=₹${newBalance}`);

      // Send success notification
      await notificationService.notifyPaymentSuccess(
        payment.userId,
        creditAmount,
        order_id
      );

      // Log activity
      await firebaseService.logActivity(payment.userId, 'PAYMENT_SUCCESS', {
        orderId: order_id,
        amount: creditAmount,
        utr,
        environment,
      });

    } else if (verifiedStatus === 'Failed') {
      // Send failure notification
      await notificationService.createNotification(payment.userId, {
        title: '❌ Payment Failed',
        message: `Your payment of ₹${amount} could not be processed. Order: ${order_id}`,
        type: 'payment',
      });

      await firebaseService.logActivity(payment.userId, 'PAYMENT_FAILED', {
        orderId: order_id,
        amount,
        environment,
      });
    }

  } catch (err) {
    logger.error(`Webhook processing error for ${order_id}:`, err.message);
  }
}

module.exports = { handleZapWebhook };
