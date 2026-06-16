// webhooks/zapWebhook.js - Commission + Payment Link aware webhook
const firebaseService     = require('../services/firebaseService');
const walletService       = require('../services/walletService');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const zapService          = require('../services/zapService');
const { ref }             = require('../firebase/admin');
const { DB_PATHS }        = require('../config/constants');
const logger              = require('../utils/logger');

async function handleZapWebhook(req, res) {
  res.status(200).json({ status: 'ok' });
  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = req.body;
  if (!order_id) { logger.warn('Webhook: missing order_id'); return; }
  logger.info(`Webhook: orderId=${order_id} status=${status}`);
  processWebhookAsync({ order_id, status, txn_id, amount, pay_amount, utr, environment });
}

async function processWebhookAsync(data) {
  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = data;
  try {
    if (await firebaseService.isOrderProcessed(order_id)) {
      logger.warn(`Duplicate webhook ignored: ${order_id}`); return;
    }

    const payment = await firebaseService.getPayment(order_id);
    if (!payment) { logger.error(`Payment not found: ${order_id}`); return; }

    let verifiedStatus = status;
    try {
      const api = await zapService.getOrderStatus(order_id);
      verifiedStatus = api.status || status;
    } catch (e) { logger.warn(`API verify failed: ${e.message}`); }

    await firebaseService.updatePaymentStatus(order_id, { status: verifiedStatus, txn_id, utr, amount, pay_amount, environment });
    await firebaseService.markOrderProcessed(order_id);

    if (verifiedStatus !== 'Success') {
      if (verifiedStatus === 'Failed') {
        await notificationService.createNotification(payment.userId, {
          title: 'Payment Failed', message: `Payment of Rs.${amount} failed. Order: ${order_id}`, type: 'payment',
        });
      }
      return;
    }

    const grossAmount = parseFloat(pay_amount || amount || 0);
    if (grossAmount <= 0) { logger.error(`Invalid amount ${order_id}`); return; }

    const isLinkPayment = !!(payment.linkId);
    const sub     = await subscriptionService.getUserSubscription(payment.userId);
    const plan    = sub.plan;
    const commPct = isLinkPayment ? (payment.commissionPercent ?? plan.commissionPercent) : 0;
    const commission = Math.round(grossAmount * commPct * 100) / 10000;
    const netAmount  = Math.round((grossAmount - commission) * 100) / 100;

    const currentBalance = await walletService.getBalance(payment.userId);
    const available = plan.walletLimit - currentBalance;
    if (available <= 0) {
      await notificationService.createNotification(payment.userId, {
        title: 'Wallet Full', message: `Payment of Rs.${grossAmount} received but wallet is full (limit Rs.${plan.walletLimit}). Withdraw first.`, type: 'payment',
      });
      return;
    }

    const creditAmount = Math.min(netAmount, available);
    const newBalance = await walletService.creditWallet(payment.userId, creditAmount, `Order ${order_id}`);
    logger.info(`Credited ${payment.userId}: +Rs.${creditAmount}`);

    if (isLinkPayment && commission > 0) {
      const logRef = ref(DB_PATHS.COMMISSION_LOGS).push();
      await logRef.set({
        id: logRef.key, userId: payment.userId, linkId: payment.linkId,
        orderId: order_id, grossAmount, commission, netAmount: creditAmount,
        commissionPercent: commPct, planId: plan.id, planName: plan.name, createdAt: Date.now(),
      });
      await ref(`${DB_PATHS.PAYMENT_LINKS}/${payment.linkId}`).transaction((link) => {
        if (!link) return link;
        return { ...link, paymentCount: (link.paymentCount||0)+1, totalCollected: (link.totalCollected||0)+grossAmount, lastPaidAt: Date.now() };
      });
    }

    const msg = isLinkPayment
      ? `Rs.${creditAmount} credited (Rs.${grossAmount} - Rs.${commission} commission). Order: ${order_id}`
      : `Rs.${creditAmount} added to your wallet. Order: ${order_id}`;

    await notificationService.createNotification(payment.userId, {
      title: isLinkPayment ? 'Payment Received via Link' : 'Wallet Credited',
      message: msg, type: 'payment',
    });

    await firebaseService.logActivity(payment.userId, 'PAYMENT_SUCCESS', {
      orderId: order_id, grossAmount, commission, netAmount: creditAmount, linkId: payment.linkId || null, utr,
    });

  } catch (err) {
    logger.error(`Webhook error for ${order_id}:`, err.message);
  }
}

module.exports = { handleZapWebhook };
