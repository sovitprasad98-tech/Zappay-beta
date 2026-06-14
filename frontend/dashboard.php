<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Dashboard';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">

    <!-- Page Header -->
    <div class="zp-page-header d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div>
        <h1 class="zp-page-title" id="welcomeMsg">Good day 👋</h1>
        <p class="zp-page-subtitle">Here's what's happening with your account today.</p>
      </div>
      <a href="/payment-link.php" class="btn btn-zp-primary d-flex align-items-center gap-2">
        <i class="bi bi-plus-lg"></i> New Payment Link
      </a>
    </div>

    <!-- Loading State -->
    <div id="pageLoading" class="zp-loading">
      <div class="zp-spinner"></div>
      <span>Loading your dashboard...</span>
    </div>

    <!-- Dashboard Content -->
    <div id="dashContent" class="d-none">

      <!-- Wallet Card -->
      <div class="zp-wallet-card mb-4" style="max-width:420px">
        <div class="zp-wallet-balance-label">Wallet Balance</div>
        <div class="zp-wallet-balance-amount" id="walletBalance">₹0.00</div>
        <div class="d-flex gap-2 mt-3 position-relative" style="z-index:1">
          <a href="/payment-link.php" class="btn btn-sm btn-light fw-semibold d-flex align-items-center gap-1">
            <i class="bi bi-plus-circle"></i> Add Money
          </a>
          <a href="/withdrawal.php" class="btn btn-sm btn-outline-light fw-semibold d-flex align-items-center gap-1">
            <i class="bi bi-arrow-up-right-circle"></i> Withdraw
          </a>
        </div>
      </div>

      <!-- Stat Cards -->
      <div class="zp-stats-grid mb-4">
        <div class="zp-stat-card">
          <div class="zp-stat-icon blue"><i class="bi bi-arrow-down-circle"></i></div>
          <div class="zp-stat-label">Total Received</div>
          <div class="zp-stat-value" id="statReceived">₹0</div>
        </div>
        <div class="zp-stat-card">
          <div class="zp-stat-icon green"><i class="bi bi-check-circle"></i></div>
          <div class="zp-stat-label">Success Payments</div>
          <div class="zp-stat-value" id="statSuccess">0</div>
        </div>
        <div class="zp-stat-card">
          <div class="zp-stat-icon amber"><i class="bi bi-arrow-up-right-circle"></i></div>
          <div class="zp-stat-label">Total Withdrawn</div>
          <div class="zp-stat-value" id="statWithdrawn">₹0</div>
        </div>
        <div class="zp-stat-card">
          <div class="zp-stat-icon red"><i class="bi bi-clock"></i></div>
          <div class="zp-stat-label">Pending Withdrawal</div>
          <div class="zp-stat-value" id="statPending">0</div>
        </div>
      </div>

      <!-- Recent Transactions -->
      <div class="zp-card">
        <div class="zp-card-header">
          <span class="zp-card-title"><i class="bi bi-clock-history me-2 text-primary"></i>Recent Transactions</span>
          <a href="/payment-history.php" class="btn btn-sm btn-zp-outline">View All</a>
        </div>

        <div id="txnLoading" class="zp-loading py-4">
          <div class="zp-spinner" style="width:28px;height:28px"></div>
        </div>

        <div id="txnEmpty" class="zp-empty d-none">
          <div class="zp-empty-icon"><i class="bi bi-receipt"></i></div>
          <div class="zp-empty-title">No transactions yet</div>
          <div class="zp-empty-text">Create a payment link to receive your first payment.</div>
        </div>

        <div id="txnList" class="d-none">
          <div class="table-responsive">
            <table class="zp-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody id="txnBody"></tbody>
            </table>
          </div>
        </div>
      </div>

    </div><!-- /dashContent -->
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  const user = Auth.getUser();
  if (user?.displayName) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('welcomeMsg').textContent = `${greet}, ${user.displayName.split(' ')[0]} 👋`;
  }

  // Load data in parallel
  const [balRes, payRes, wdRes] = await Promise.all([
    API.get('/wallet/balance'),
    API.get('/payment/history?limit=5'),
    API.get('/withdrawal/history'),
  ]);

  document.getElementById('pageLoading').classList.add('d-none');
  document.getElementById('dashContent').classList.remove('d-none');

  // Wallet balance
  if (balRes?.success) {
    document.getElementById('walletBalance').textContent = Fmt.currency(balRes.data.balance);
    document.getElementById('sidebarBalance').textContent = parseFloat(balRes.data.balance).toLocaleString('en-IN', {minimumFractionDigits:2});
  }

  // Stats
  if (payRes?.success) {
    const payments = payRes.data.payments || [];
    const successPay = payments.filter(p => p.status === 'success');
    const totalReceived = successPay.reduce((s, p) => s + (p.payAmount || p.amount || 0), 0);
    document.getElementById('statReceived').textContent = Fmt.currency(totalReceived);
    document.getElementById('statSuccess').textContent = successPay.length;
  }

  if (wdRes?.success) {
    const wds = wdRes.data.withdrawals || [];
    const approved = wds.filter(w => w.status === 'approved');
    const pending  = wds.filter(w => w.status === 'pending');
    document.getElementById('statWithdrawn').textContent = Fmt.currency(approved.reduce((s,w)=>s+w.netAmount,0));
    document.getElementById('statPending').textContent = pending.length;
  }

  // Recent transactions table
  document.getElementById('txnLoading').classList.add('d-none');
  const payments = payRes?.data?.payments || [];
  if (payments.length === 0) {
    document.getElementById('txnEmpty').classList.remove('d-none');
  } else {
    document.getElementById('txnList').classList.remove('d-none');
    const tbody = document.getElementById('txnBody');
    tbody.innerHTML = payments.slice(0,5).map(p => `
      <tr>
        <td><span class="text-muted" style="font-size:12px;font-family:monospace">${p.orderId}</span></td>
        <td><strong>${Fmt.currency(p.amount)}</strong></td>
        <td>${Fmt.statusBadge(p.status)}</td>
        <td class="text-muted" style="font-size:12px">${Fmt.datetime(p.createdAt)}</td>
      </tr>
    `).join('');
  }
});
</script>
</body>
</html>
