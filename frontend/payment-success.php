<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Payment Successful';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main d-flex align-items-center justify-content-center" style="min-height:80vh">
    <div class="text-center" style="max-width:420px;width:100%">

      <!-- Success Animation -->
      <div style="width:90px;height:90px;background:var(--zp-success-light);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:44px;color:var(--zp-success)">
        <i class="bi bi-check-circle-fill"></i>
      </div>

      <h1 class="fw-bold mb-2" style="font-size:26px">Payment Successful!</h1>
      <p class="text-muted mb-1">Your payment has been received.</p>
      <p class="text-muted mb-4 small">Your wallet will be credited shortly after verification.</p>

      <div class="zp-card mb-4 text-start">
        <div class="zp-card-header">
          <span class="zp-card-title">Payment Details</span>
        </div>
        <div class="d-flex justify-content-between py-2 border-bottom">
          <span class="text-muted small">Order ID</span>
          <span class="fw-semibold small font-monospace" id="orderId">—</span>
        </div>
        <div class="d-flex justify-content-between py-2 border-bottom">
          <span class="text-muted small">UTR Number</span>
          <span class="fw-semibold small" id="utrNo">—</span>
        </div>
        <div class="d-flex justify-content-between py-2">
          <span class="text-muted small">Status</span>
          <span class="zp-badge zp-badge-success"><i class="bi bi-check-circle"></i>Verified</span>
        </div>
      </div>

      <div class="d-grid gap-2">
        <a href="/dashboard.php" class="btn btn-zp-primary">
          <i class="bi bi-grid me-1"></i>Go to Dashboard
        </a>
        <a href="/payment-link.php" class="btn btn-zp-outline">
          <i class="bi bi-plus-circle me-1"></i>Create New Payment
        </a>
      </div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const params   = new URLSearchParams(window.location.search);
  const orderId  = params.get('order_id') || '—';
  const utr      = params.get('utr') || 'Processing...';

  document.getElementById('orderId').textContent = orderId;
  document.getElementById('utrNo').textContent   = utr;

  // Refresh sidebar balance after a delay (webhook may have credited by now)
  setTimeout(loadSidebarBalance, 3000);

  Toast.success('Payment successful! Wallet will be updated shortly.');
});
</script>
</body>
</html>
