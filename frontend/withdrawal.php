<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Withdrawal';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header">
      <h1 class="zp-page-title"><i class="bi bi-arrow-up-right-circle me-2 text-primary"></i>Withdrawal</h1>
      <p class="zp-page-subtitle">Request a withdrawal from your wallet balance.</p>
    </div>

    <div class="row g-4">

      <!-- Request Form -->
      <div class="col-12 col-lg-5">
        <div class="zp-card">
          <div class="zp-card-header">
            <span class="zp-card-title">New Request</span>
            <span class="zp-badge zp-badge-primary" id="balancePill">Balance: ₹—</span>
          </div>

          <div id="wdAlert" class="zp-alert d-none mb-3">
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
            <span id="wdAlertMsg"></span>
          </div>

          <div class="mb-3">
            <label class="zp-label">Withdrawal Amount (₹)</label>
            <div class="zp-input-group">
              <span class="zp-input-prefix fw-bold">₹</span>
              <input type="number" id="wdAmount" class="zp-input" placeholder="Minimum ₹100"
                     min="100" step="1" />
            </div>
          </div>

          <div class="mb-3">
            <label class="zp-label">UPI ID</label>
            <input type="text" id="wdUpi" class="zp-input" placeholder="yourname@bank" />
          </div>

          <div class="mb-4">
            <label class="zp-label">Account Holder Name (Optional)</label>
            <input type="text" id="wdName" class="zp-input" placeholder="As per bank account" />
          </div>

          <!-- Commission preview -->
          <div class="zp-card p-3 mb-4" style="background:var(--zp-bg);border-style:dashed" id="previewBox">
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted small">Withdrawal Amount</span>
              <span class="fw-semibold" id="previewAmount">₹0</span>
            </div>
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted small">Platform Commission (<span id="previewCommPct">5</span>%)</span>
              <span class="text-danger fw-semibold" id="previewComm">- ₹0</span>
            </div>
            <div class="zp-divider my-2"></div>
            <div class="d-flex justify-content-between">
              <span class="fw-semibold">You'll Receive</span>
              <span class="fw-bold text-success fs-6" id="previewNet">₹0</span>
            </div>
          </div>

          <button class="btn btn-zp-primary w-100" id="submitWdBtn">
            <span id="submitWdText"><i class="bi bi-send me-1"></i>Submit Request</span>
            <span id="submitWdLoading" class="d-none">
              <span class="spinner-border spinner-border-sm me-1"></span>Submitting...
            </span>
          </button>

          <div class="zp-alert zp-alert-warning mt-3 mb-0">
            <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
            <div style="font-size:12px">Withdrawal amount is <strong>held from your wallet</strong> until the request is processed by admin. Rejected requests are auto-refunded.</div>
          </div>
        </div>
      </div>

      <!-- History -->
      <div class="col-12 col-lg-7">
        <div class="zp-card">
          <div class="zp-card-header">
            <span class="zp-card-title">Withdrawal History</span>
          </div>

          <div id="wdLoading" class="zp-loading py-4">
            <div class="zp-spinner" style="width:28px;height:28px"></div>
          </div>

          <div id="wdEmpty" class="zp-empty d-none">
            <div class="zp-empty-icon"><i class="bi bi-arrow-up-circle"></i></div>
            <div class="zp-empty-title">No withdrawals yet</div>
            <div class="zp-empty-text">Submit your first withdrawal request.</div>
          </div>

          <div id="wdTable" class="d-none">
            <div class="table-responsive">
              <table class="zp-table">
                <thead>
                  <tr>
                    <th>Amount</th>
                    <th>Net Amount</th>
                    <th>UPI ID</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody id="wdTableBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
let commissionPct = 5;
let currentBalance = 0;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  // Load balance and history in parallel
  const [balRes, wdRes] = await Promise.all([
    API.get('/wallet/balance'),
    API.get('/withdrawal/history'),
  ]);

  if (balRes?.success) {
    currentBalance = balRes.data.balance;
    document.getElementById('balancePill').textContent = `Balance: ${Fmt.currency(currentBalance)}`;
  }

  // Update commission preview on amount input
  document.getElementById('wdAmount').addEventListener('input', updatePreview);
  updatePreview();

  // History
  document.getElementById('wdLoading').classList.add('d-none');
  const wds = wdRes?.data?.withdrawals || [];
  if (wds.length === 0) {
    document.getElementById('wdEmpty').classList.remove('d-none');
  } else {
    document.getElementById('wdTable').classList.remove('d-none');
    document.getElementById('wdTableBody').innerHTML = wds.map(w => `
      <tr>
        <td><strong>${Fmt.currency(w.amount)}</strong></td>
        <td class="text-success fw-semibold">${Fmt.currency(w.netAmount)}</td>
        <td class="text-muted" style="font-size:12px">${w.upiId}</td>
        <td>${Fmt.statusBadge(w.status)}</td>
        <td class="text-muted" style="font-size:12px;white-space:nowrap">${Fmt.date(w.createdAt)}</td>
      </tr>
    `).join('');
  }

  // Submit handler
  document.getElementById('submitWdBtn').addEventListener('click', submitWithdrawal);
});

function updatePreview() {
  const amount = parseFloat(document.getElementById('wdAmount').value) || 0;
  const commission = Math.round(amount * commissionPct) / 100;
  const net = Math.round((amount - commission) * 100) / 100;
  document.getElementById('previewAmount').textContent = Fmt.currency(amount);
  document.getElementById('previewComm').textContent   = `- ${Fmt.currency(commission)}`;
  document.getElementById('previewNet').textContent    = Fmt.currency(net > 0 ? net : 0);
  document.getElementById('previewCommPct').textContent = commissionPct;
}

async function submitWithdrawal() {
  const amount = parseFloat(document.getElementById('wdAmount').value);
  const upiId  = document.getElementById('wdUpi').value.trim();
  const name   = document.getElementById('wdName').value.trim();
  const alertEl = document.getElementById('wdAlert');
  const alertMsg = document.getElementById('wdAlertMsg');

  function showErr(msg) {
    alertEl.className = 'zp-alert zp-alert-danger mb-3';
    alertMsg.textContent = msg;
    alertEl.classList.remove('d-none');
  }

  alertEl.classList.add('d-none');

  if (!amount || amount < 100)        return showErr('Minimum withdrawal amount is ₹100');
  if (amount > currentBalance)        return showErr(`Insufficient balance. Available: ${Fmt.currency(currentBalance)}`);
  if (!upiId)                         return showErr('Please enter your UPI ID');
  if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) return showErr('Invalid UPI ID format (e.g. name@bank)');

  const btn = document.getElementById('submitWdBtn');
  btn.disabled = true;
  document.getElementById('submitWdText').classList.add('d-none');
  document.getElementById('submitWdLoading').classList.remove('d-none');

  const res = await API.post('/withdrawal/request', { amount, upiId, accountName: name });

  btn.disabled = false;
  document.getElementById('submitWdText').classList.remove('d-none');
  document.getElementById('submitWdLoading').classList.add('d-none');

  if (res?.success) {
    Toast.success('Withdrawal request submitted! Admin will process it soon.');
    setTimeout(() => window.location.reload(), 1500);
  } else {
    showErr(res?.message || 'Failed to submit request. Please try again.');
  }
}
</script>
</body>
</html>
