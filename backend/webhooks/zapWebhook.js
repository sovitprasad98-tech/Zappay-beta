// webhooks/zapWebhook.js
const firebaseService     = require('../services/firebaseService');
const walletService       = require('../services/walletService');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const zapService          = require('../services/zapService');
const { ref }             = require('../firebase/admin');
const { DB_PATHS, DEFAULT_PLANS } = require('../config/constants');
const logger              = require('../utils/logger');

async function handleZapWebhook(req, res) {
  res.status(200).json({ status: 'ok' });
  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = req.body;
  if (!order_id) { logger.warn('Webhook: missing order_id'); return; }
  logger.info(`Webhook: ${order_id} status=${status}`);
  processWebhookAsync({ order_id, status, txn_id, amount, pay_amount, utr, environment });
}

async function processWebhookAsync(data) {
  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = data;
  try {
    // Duplicate check
    if (await firebaseService.isOrderProcessed(order_id)) {
      logger.warn(`Duplicate ignored: ${order_id}`); return;
    }

    const payment = await firebaseService.getPayment(order_id);
    if (!payment) { logger.error(`Payment not found: ${order_id}`); return; }

    // Verify with Zap API
    let verifiedStatus = status;
    try {
      const api = await zapService.getOrderStatus(order_id);
      verifiedStatus = api.status || status;
    } catch (e) { logger.warn(`API verify failed: ${e.message}`); }

    await firebaseService.updatePaymentStatus(order_id, { status: verifiedStatus, txn_id, utr, amount, pay_amount, environment });
    await firebaseService.markOrderProcessed(order_id);

    if (verifiedStatus !== 'Success') {
      await notificationService.createNotification(payment.userId, {
        title: '❌ Payment Failed',
        message: `Payment of ₹${amount} failed. Order: ${order_id}`,
        type: 'payment',
      });
      return;
    }

    const grossAmount = parseFloat(pay_amount || amount || 0);
    if (grossAmount <= 0) return;

    // ── SUBSCRIPTION PAYMENT ──
    if (payment.type === 'subscription' && payment.planId) {
      await handleSubscriptionPayment(payment, grossAmount, order_id);
      return;
    }

    // ── WALLET TOP-UP (direct) ──
    if (!payment.linkId) {
      await handleWalletTopup(payment, grossAmount, order_id);
      return;
    }

    // ── PAYMENT LINK PAYMENT ──
    await handleLinkPayment(payment, grossAmount, order_id, utr);

  } catch (err) {
    logger.error(`Webhook error ${order_id}:`, err.message);
  }
}

async function handleSubscriptionPayment(payment, amount, orderId) {
  try {
    const plan = await subscriptionService.getPlan(payment.planId) || DEFAULT_PLANS[payment.planId];
    if (!plan) { logger.error(`Plan not found: ${payment.planId}`); return; }

    await subscriptionService.activateSubscription(payment.userId, payment.planId, 30);

    await notificationService.createNotification(payment.userId, {
      title: `🎉 ${plan.name} Plan Activated!`,
      message: `Your ${plan.name} subscription is now active for 30 days. Payment ₹${amount} confirmed.`,
      type: 'subscription',
    });

    await firebaseService.logActivity(payment.userId, 'SUBSCRIPTION_ACTIVATED', {
      planId: payment.planId, planName: plan.name, amount, orderId,
    });

    logger.info(`Subscription activated: ${payment.userId} → ${payment.planId}`);
  } catch (err) {
    logger.error(`Subscription activation failed: ${err.message}`);
  }
}

async function handleWalletTopup(payment, amount, orderId) {
  const sub  = await subscriptionService.getUserSubscription(payment.userId);
  const plan = sub.plan;
  const balance  = await walletService.getBalance(payment.userId);
  const available = plan.walletLimit - balance;

  if (available <= 0) {
    await notificationService.createNotification(payment.userId, {
      title: '⚠️ Wallet Full',
      message: `Payment of ₹${amount} received but wallet is full (limit ₹${plan.walletLimit}). Please withdraw first.`,
      type: 'payment',
    });
    return;
  }

  const credit = Math.min(amount, available);
  await walletService.creditWallet(payment.userId, credit, `Top-up ${orderId}`);

  await notificationService.createNotification(payment.userId, {
    title: '💰 Wallet Credited',
    message: `₹${credit} added to your wallet. Order: ${orderId}`,
    type: 'payment',
  });

  await firebaseService.logActivity(payment.userId, 'WALLET_TOPUP', { orderId, amount: credit });
  logger.info(`Wallet top-up: ${payment.userId} +₹${credit}`);
}

async function handleLinkPayment(payment, grossAmount, orderId, utr) {
  const sub  = await subscriptionService.getUserSubscription(payment.userId);
  const plan = sub.plan;

  const balance   = await walletService.getBalance(payment.userId);
  const available = plan.walletLimit - balance;

  if (available <= 0) {
    await notificationService.createNotification(payment.userId, {
      title: '⚠️ Wallet Full',
      message: `Payment ₹${grossAmount} received but wallet full. Withdraw funds.`,
      type: 'payment',
    });
    return;
  }

  // Credit the FULL amount received — no commission is deducted here.
  // Commission is only applied later, at withdrawal time.
  const credit = Math.min(grossAmount, available);
  await walletService.creditWallet(payment.userId, credit, `Link ${payment.linkId}`);

  await ref(`${DB_PATHS.PAYMENT_LINKS}/${payment.linkId}`).transaction(l => {
    if (!l) return l;
    return { ...l, paymentCount: (l.paymentCount||0)+1, totalCollected: (l.totalCollected||0)+grossAmount, lastPaidAt: Date.now() };
  });

  await notificationService.createNotification(payment.userId, {
    title: '💰 Payment Received via Link',
    message: `₹${credit} credited to your wallet. Order: ${orderId}`,
    type: 'payment',
  });

  await firebaseService.logActivity(payment.userId, 'PAYMENT_SUCCESS', {
    orderId, grossAmount, netAmount: credit, linkId: payment.linkId, utr,
  });

  logger.info(`Link payment: ${payment.userId} +₹${credit}`);
}

module.exports = { handleZapWebhook };
