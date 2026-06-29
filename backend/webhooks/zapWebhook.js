// webhooks/zapWebhook.js
const firebaseService     = require('../services/firebaseService');
const walletService       = require('../services/walletService');
const notificationService = require('../services/notificationService');
const subscriptionService = require('../services/subscriptionService');
const referralService     = require('../services/referralService');
const zapService          = require('../services/zapService');
const { ref }             = require('../firebase/admin');
const { DB_PATHS, DEFAULT_PLANS } = require('../config/constants');
const logger              = require('../utils/logger');

async function handleZapWebhook(req, res) {
  const { order_id, status, txn_id, amount, pay_amount, utr, environment } = req.body;
  if (!order_id) {
    logger.warn('Webhook: missing order_id');
    return res.status(200).json({ status: 'ok' });
  }
  logger.info(`Webhook: ${order_id} status=${status}`);

  // IMPORTANT (Vercel serverless): we now AWAIT processing before
  // responding. This used to respond 200 first and then kick off
  // processWebhookAsync() without awaiting it ("fire and forget") — but
  // Vercel can freeze/terminate a serverless function's execution
  // environment right after the response is sent, which can kill that
  // unawaited work mid-flight (e.g. while still waiting on the Zap
  // order-status API call or a Firebase write). That could silently drop
  // the wallet credit / status update for an unpredictable subset of
  // payments. Awaiting first guarantees processing finishes before the
  // function instance is allowed to freeze. We still always respond 200
  // afterwards (per ZapUPI's docs) regardless of outcome — our own
  // isOrderProcessed duplicate-check safely absorbs any webhook retries.
  await processWebhookAsync({ order_id, status, txn_id, amount, pay_amount, utr, environment });

  return res.status(200).json({ status: 'ok' });
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

    // Normalize ZapUPI status strings ('Success' | 'Failed' | 'Pending',
    // but be defensive about case) into one of these 3 canonical values.
    // Also maps 'Cancelled by user', 'Rejected', 'Declined', etc. → 'Failed'
    // so that any non-standard cancel/reject string from the ZapUPI UI never
    // falls through as null and accidentally gets treated as inconclusive.
    const normalize = (s) => {
      const v = String(s || '').trim().toLowerCase();
      if (v === 'success') return 'Success';
      if (v === 'failed'
        || v.startsWith('cancel')   // 'Cancelled by user', 'cancelled', ...
        || v.startsWith('reject')   // 'Rejected'
        || v.startsWith('decline')  // 'Declined'
        || v.startsWith('expire')   // 'Expired'
      ) return 'Failed';
      if (v === 'pending') return 'Pending';
      return null; // unrecognized — treated as inconclusive
    };

    // The webhook payload's own status is the authoritative, real-time
    // signal (Zap only fires once, on the final Success/Failed state).
    //
    // CRITICAL BUG FIX: Previously the API verify ran unconditionally and
    // could override ANY webhook status — including a definitive 'Failed'.
    // This caused: webhook='Failed' (user cancelled) + API='Success' (stale
    // due to ZapUPI eventual-consistency lag) → verifiedStatus wrongly set
    // to 'Success' → wallet credited + plan activated for a CANCELLED payment.
    //
    // Fix: API verify is used ONLY as a fallback when webhook status is
    // genuinely inconclusive (null or Pending). A definitive 'Failed' or
    // 'Success' from the webhook is NEVER overridden by the API verify.
    let verifiedStatus = normalize(status);
    if (verifiedStatus !== 'Success' && verifiedStatus !== 'Failed') {
      // Inconclusive — use API as fallback
      try {
        const api = await zapService.getOrderStatus(order_id);
        const apiStatus = normalize(api.status);
        if (apiStatus === 'Success' || apiStatus === 'Failed') {
          verifiedStatus = apiStatus;
        }
      } catch (e) { logger.warn(`API verify failed: ${e.message}`); }
    } else {
      // Webhook gave definitive answer — log API mismatch for debugging only
      try {
        const api = await zapService.getOrderStatus(order_id);
        const apiStatus = normalize(api.status);
        if (apiStatus && apiStatus !== verifiedStatus) {
          logger.warn(`Webhook/API mismatch ${order_id}: webhook=${verifiedStatus}, API=${apiStatus} — trusting webhook`);
        }
      } catch (e) { /* non-critical — already have definitive status */ }
    }

    await firebaseService.updatePaymentStatus(order_id, { status: verifiedStatus, txn_id, utr, amount, pay_amount, environment });

    if (verifiedStatus !== 'Success' && verifiedStatus !== 'Failed') {
      // Still inconclusive (e.g. webhook status was missing/garbled AND the
      // verify call only returned "Pending"). Do NOT mark as processed —
      // leave it open so a later webhook retry (or the order-status poll
      // from pay.html) can still resolve it correctly instead of getting
      // permanently stuck.
      logger.warn(`Webhook ${order_id}: inconclusive status (raw="${status}"), leaving unprocessed for retry`);
      return;
    }

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
      // Referral reward only triggers for an EXPLICIT self-funded top-up —
      // never for 'quick_link' orders, since those may be paid by a
      // customer rather than the merchant themselves.
      if (payment.type === 'wallet_topup') {
        await referralService.processQualifyingDeposit(payment.userId, grossAmount);
      }
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

  // Update link stats (paymentCount, totalCollected) — read-then-write,
  // same .transaction() reliability fix as walletService. This runs on
  // every successful pay.html payment, so it's directly in that critical path.
  const linkRef = ref(`${DB_PATHS.PAYMENT_LINKS}/${payment.linkId}`);
  const linkSnap = await linkRef.once('value');
  const linkData = linkSnap.val();
  if (linkData) {
    await linkRef.update({
      paymentCount: (linkData.paymentCount || 0) + 1,
      totalCollected: (linkData.totalCollected || 0) + grossAmount,
      lastPaidAt: Date.now(),
    });
  }

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
