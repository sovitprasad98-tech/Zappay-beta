<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Wallet';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header">
      <h1 class="zp-page-title"><i class="bi bi-wallet2 me-2 text-primary"></i>My Wallet</h1>
      <p class="zp-page-subtitle">Manage your wallet balance and transactions.</p>
    </div>

    <!-- Loading -->
    <div id="pageLoading" class="zp-loading">
      <div class="zp-spinner"></div>
      <span>Loading wallet...</span>
    </div>

    <div id="walletContent" class="d-none">

      <!-- Wallet Card -->
      <div class="row g-4 mb-4">
        <div class="col-12 col-md-5">
          <div class="zp-wallet-card h-100">
            <div class="zp-wallet-balance-label">Available Balance</div>
            <div class="zp-wallet-balance-amount" id="balanceAmt">₹0.00</div>
            <div class="zp-divider" style="background:rgba(255,255,255,.2);margin:16px 0"></div>
            <div class="d-flex gap-2" style="position:relative;z-index:1">
              <a href="/payment-link.php" class="btn btn-sm btn-light fw-semibold flex-fill text-center">
                <i class="bi bi-plus-circle me-1"></i>Add Money
              </a>
              <a href="/withdrawal.php" class="btn btn-sm btn-outline-light fw-semibold flex-fill text-center">
                <i class="bi bi-arrow-up-right-circle me-1"></i>Withdraw
              </a>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-7">
          <div class="row g-3 h-100">
            <div class="col-6">
              <div class="zp-stat-card h-100">
                <div class="zp-stat-icon green"><i class="bi bi-arrow-down-circle"></i></div>
                <div class="zp-stat-label">Total Credited</div>
                <div class="zp-stat-value" id="totalCredited">₹0</div>
              </div>
            </div>
            <div class="col-6">
              <div class="zp-stat-card h-100">
                <div class="zp-stat-icon amber"><i class="bi bi-arrow-up-circle"></i></div>
                <div class="zp-stat-label">Total Withdrawn</div>
                <div class="zp-stat-value" id="totalWithdrawn">₹0</div>
              </div>
            </div>
            <div class="col-6">
              <div class="zp-stat-card h-100">
                <div class="zp-stat-icon blue"><i class="bi bi-clock"></i></div>
                <div class="zp-stat-label">Pending Withdrawal</div>
                <div class="zp-stat-value" id="pendingWd">₹0</div>
              </div>
            </div>
            <div class="col-6">
              <div class="zp-stat-card h-100">
                <div class="zp-stat-icon red"><i class="bi bi-percent"></i></div>
                <div class="zp-stat-label">Commission Paid</div>
                <div class="zp-stat-value" id="commissionPaid">₹0</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Banner -->
      <div class="zp-alert zp-alert-info mb-4">
        <i class="bi bi-info-circle-fill flex-shrink-0"></i>
        <div>
          Minimum withdrawal: <strong>₹100</strong> &nbsp;|&nbsp;
          Platform commission: <strong id="commissionRate">5%</strong> per withdrawal
        </div>
      </div>

      <!-- Recent Credited Payments -->
      <div class="zp-card">
        <div class="zp-card-header">
          <span class="zp-card-title">Recent Credits</span>
          <a href="/payment-history.php" class="btn btn-sm btn-zp-outline">All Transactions</a>
        </div>
        <div id="creditsBody">
          <div class="zp-loading py-4">
            <div class="zp-spinner" style="width:26px;height:26px;border-width:2px"></div>
          </div>
        </div>
      </div>

    </div><!-- /walletContent -->
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  const [balRes, payRes, wdRes, settingsRes] = await Promise.all([
    API.get('/wallet/balance'),
    API.get('/payment/history?limit=50'),
    API.get('/withdrawal/history'),
    API.get('/admin/settings').catch(() => null),
  ]);

  document.getElementById('pageLoading').classList.add('d-none');
  document.getElementById('walletContent').classList.remove('d-none');

  // Balance
  if (balRes?.success) {
    document.getElementById('balanceAmt').textContent = Fmt.currency(balRes.data.balance);
  }

  // Payment stats
  if (payRes?.success) {
    const payments = payRes.data.payments || [];
    const credited = payments.filter(p => p.status === 'success').reduce((s,p) => s+(p.payAmount||p.amount||0), 0);
    document.getElementById('totalCredited').textContent = Fmt.currency(credited);

    // Recent credits table
    const credits = payments.filter(p => p.status === 'success').slice(0,8);
    const creditsBody = document.getElementById('creditsBody');
    if (credits.length === 0) {
      creditsBody.innerHTML = `<div class="zp-empty py-4"><div class="zp-empty-icon"><i class="bi bi-wallet2"></i></div><div class="zp-empty-title">No credits yet</div><div class="zp-empty-text">Create a payment link to receive money.</div></div>`;
    } else {
      creditsBody.innerHTML = `
        <div class="table-responsive">
          <table class="zp-table">
            <thead><tr><th>Order ID</th><th>Amount</th><th>UTR</th><th>Date</th></tr></thead>
            <tbody>${credits.map(p => `
              <tr>
                <td style="font-family:monospace;font-size:12px">${p.orderId}</td>
                <td><strong class="text-success">${Fmt.currency(p.payAmount||p.amount)}</strong></td>
                <td class="text-muted" style="font-size:12px">${p.utr||'—'}</td>
                <td class="text-muted" style="font-size:12px">${Fmt.datetime(p.createdAt)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  // Withdrawal stats
  if (wdRes?.success) {
    const wds = wdRes.data.withdrawals || [];
    const approved = wds.filter(w => w.status === 'approved');
    const pending  = wds.filter(w => w.status === 'pending');
    document.getElementById('totalWithdrawn').textContent = Fmt.currency(approved.reduce((s,w)=>s+w.netAmount,0));
    document.getElementById('pendingWd').textContent      = Fmt.currency(pending.reduce((s,w)=>s+w.amount,0));
    document.getElementById('commissionPaid').textContent = Fmt.currency(wds.reduce((s,w)=>s+(w.commission||0),0));
  }
});
</script>
</body>
</html>
