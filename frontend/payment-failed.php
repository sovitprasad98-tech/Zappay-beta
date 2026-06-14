<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Payment Failed';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main d-flex align-items-center justify-content-center" style="min-height:80vh">
    <div class="text-center" style="max-width:420px;width:100%">

      <div style="width:90px;height:90px;background:var(--zp-danger-light);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:44px;color:var(--zp-danger)">
        <i class="bi bi-x-circle-fill"></i>
      </div>

      <h1 class="fw-bold mb-2" style="font-size:26px">Payment Failed</h1>
      <p class="text-muted mb-1">Your payment could not be processed.</p>
      <p class="text-muted mb-4 small">No money has been deducted. Please try again.</p>

      <div class="zp-card mb-4 text-start">
        <div class="d-flex justify-content-between py-2 border-bottom">
          <span class="text-muted small">Order ID</span>
          <span class="fw-semibold small font-monospace" id="orderId">—</span>
        </div>
        <div class="d-flex justify-content-between py-2">
          <span class="text-muted small">Status</span>
          <span class="zp-badge zp-badge-danger"><i class="bi bi-x-circle"></i>Failed / Timeout</span>
        </div>
      </div>

      <div class="d-grid gap-2">
        <a href="/payment-link.php" class="btn btn-zp-primary">
          <i class="bi bi-arrow-repeat me-1"></i>Try Again
        </a>
        <a href="/dashboard.php" class="btn btn-zp-outline">
          <i class="bi bi-grid me-1"></i>Back to Dashboard
        </a>
      </div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id') || '—';
  document.getElementById('orderId').textContent = orderId;
  Toast.error('Payment failed. Please try again.');
});
</script>
</body>
</html>
