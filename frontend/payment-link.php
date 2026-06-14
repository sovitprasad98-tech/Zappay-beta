<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Payment Link';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header">
      <h1 class="zp-page-title"><i class="bi bi-link-45deg me-2 text-primary"></i>Generate Payment Link</h1>
      <p class="zp-page-subtitle">Share the payment link with your customer to receive money.</p>
    </div>

    <div class="row g-4 justify-content-center">
      <div class="col-12 col-md-8 col-lg-6">

        <!-- Step 1: Create Order Form -->
        <div class="zp-card" id="createStep">
          <div class="zp-card-header">
            <span class="zp-card-title">Enter Payment Details</span>
          </div>

          <div id="formAlert" class="zp-alert d-none mb-3">
            <i class="bi bi-exclamation-triangle-fill"></i>
            <span id="formAlertMsg"></span>
          </div>

          <div class="mb-4 text-center">
            <label class="zp-label text-center d-block mb-2">Amount (₹)</label>
            <div class="zp-input-group" style="max-width:220px;margin:0 auto">
              <span class="zp-input-prefix" style="font-size:20px;font-weight:700;top:50%">₹</span>
              <input type="number" id="amountInput" class="zp-amount-input" placeholder="0.00"
                     min="1" max="100000" step="0.01" style="padding-left:36px" />
            </div>
          </div>

          <div class="mb-3">
            <label class="zp-label">Remark (Optional)</label>
            <input type="text" id="remarkInput" class="zp-input" placeholder="e.g. Product Name or Order #"
                   maxlength="80" />
          </div>

          <div class="mb-4">
            <label class="zp-label">Customer Mobile (Optional)</label>
            <input type="tel" id="mobileInput" class="zp-input" placeholder="9876543210" maxlength="10" />
          </div>

          <button class="btn btn-zp-primary w-100" id="createBtn">
            <span id="createBtnText"><i class="bi bi-lightning-charge me-1"></i>Generate Payment Link</span>
            <span id="createBtnLoading" class="d-none">
              <span class="spinner-border spinner-border-sm me-1"></span> Creating...
            </span>
          </button>
        </div>

        <!-- Step 2: Payment URL Ready -->
        <div class="zp-card d-none" id="linkStep">
          <div class="text-center mb-4">
            <div style="width:56px;height:56px;background:var(--zp-success-light);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:26px;color:var(--zp-success)">
              <i class="bi bi-check-circle-fill"></i>
            </div>
            <h5 class="fw-bold mb-1">Payment Link Ready!</h5>
            <p class="text-muted small">Share this link with your customer</p>
          </div>

          <div class="mb-3">
            <label class="zp-label">Order ID</label>
            <div class="zp-link-box" style="font-family:monospace">
              <i class="bi bi-hash text-primary"></i>
              <span id="displayOrderId">—</span>
            </div>
          </div>

          <div class="mb-3">
            <label class="zp-label">Amount</label>
            <div class="zp-link-box">
              <i class="bi bi-currency-rupee text-success"></i>
              <span id="displayAmount" class="fw-bold">—</span>
            </div>
          </div>

          <div class="mb-4">
            <label class="zp-label">Payment URL</label>
            <div class="zp-link-box">
              <i class="bi bi-link-45deg text-primary flex-shrink-0"></i>
              <span id="displayPayUrl" class="text-truncate" style="max-width:220px">—</span>
              <button class="btn btn-sm btn-link p-0 ms-auto text-primary" id="copyUrlBtn" title="Copy">
                <i class="bi bi-clipboard"></i>
              </button>
            </div>
          </div>

          <div class="d-grid gap-2">
            <button class="btn btn-zp-primary" id="openPayBtn">
              <i class="bi bi-box-arrow-up-right me-1"></i>Open Payment Page
            </button>
            <button class="btn btn-zp-outline" id="shareBtn">
              <i class="bi bi-share me-1"></i>Share Link
            </button>
            <button class="btn btn-sm btn-link text-muted" id="newLinkBtn">
              <i class="bi bi-plus-circle me-1"></i>Create Another
            </button>
          </div>
        </div>

        <!-- Info box -->
        <div class="zp-alert zp-alert-info mt-3">
          <i class="bi bi-info-circle-fill flex-shrink-0"></i>
          <div>
            <strong>How it works:</strong> Customer pays via the link → Money goes to owner's UPI account → Your wallet is credited automatically after verification.
          </div>
        </div>

      </div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
let currentOrderId  = '';
let currentPayUrl   = '';
let currentAmount   = 0;

const createBtn        = document.getElementById('createBtn');
const createBtnText    = document.getElementById('createBtnText');
const createBtnLoading = document.getElementById('createBtnLoading');
const formAlert        = document.getElementById('formAlert');
const formAlertMsg     = document.getElementById('formAlertMsg');

function showFormError(msg) {
  formAlert.className = 'zp-alert zp-alert-danger mb-3';
  formAlertMsg.textContent = msg;
  formAlert.classList.remove('d-none');
  createBtnText.classList.remove('d-none');
  createBtnLoading.classList.add('d-none');
  createBtn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth()) return;

  createBtn.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('amountInput').value);
    const remark = document.getElementById('remarkInput').value.trim();
    const mobile = document.getElementById('mobileInput').value.trim();

    if (!amount || amount < 1) return showFormError('Please enter a valid amount (minimum ₹1)');
    if (amount > 100000) return showFormError('Maximum amount is ₹1,00,000');

    formAlert.classList.add('d-none');
    createBtn.disabled = true;
    createBtnText.classList.add('d-none');
    createBtnLoading.classList.remove('d-none');

    const payload = { amount };
    if (remark) payload.remark = remark;
    if (mobile && mobile.length === 10) payload.customerMobile = mobile;

    const res = await API.post('/payment/create-order', payload);

    if (!res?.success) {
      return showFormError(res?.message || 'Failed to create order. Try again.');
    }

    // Show link step
    currentOrderId = res.data.orderId;
    currentPayUrl  = res.data.paymentUrl;
    currentAmount  = res.data.amount;

    document.getElementById('displayOrderId').textContent = currentOrderId;
    document.getElementById('displayAmount').textContent  = Fmt.currency(currentAmount);
    document.getElementById('displayPayUrl').textContent  = currentPayUrl;

    document.getElementById('createStep').classList.add('d-none');
    document.getElementById('linkStep').classList.remove('d-none');

    Toast.success('Payment link created!');
  });

  // Copy URL
  document.getElementById('copyUrlBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(currentPayUrl).then(() => Toast.success('Link copied!'));
  });

  // Open payment page (same tab as per Zap rules)
  document.getElementById('openPayBtn')?.addEventListener('click', () => {
    if (currentPayUrl) window.location.href = currentPayUrl;
  });

  // Share
  document.getElementById('shareBtn')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Payment Link',
          text: `Pay ₹${currentAmount} via ZapPay`,
          url: currentPayUrl,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(currentPayUrl).then(() => Toast.info('Link copied (share not supported on this browser)'));
    }
  });

  // Create another
  document.getElementById('newLinkBtn')?.addEventListener('click', () => {
    document.getElementById('amountInput').value = '';
    document.getElementById('remarkInput').value = '';
    document.getElementById('mobileInput').value = '';
    document.getElementById('createStep').classList.remove('d-none');
    document.getElementById('linkStep').classList.add('d-none');
    createBtn.disabled = false;
    createBtnText.classList.remove('d-none');
    createBtnLoading.classList.add('d-none');
  });
});
</script>
</body>
</html>
