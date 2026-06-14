<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Payment History';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div>
        <h1 class="zp-page-title"><i class="bi bi-clock-history me-2 text-primary"></i>Payment History</h1>
        <p class="zp-page-subtitle">All your received payments and transactions.</p>
      </div>
      <a href="/payment-link.php" class="btn btn-zp-primary">
        <i class="bi bi-plus-lg me-1"></i>New Payment
      </a>
    </div>

    <!-- Summary Cards -->
    <div class="row g-3 mb-4">
      <div class="col-6 col-md-3">
        <div class="zp-stat-card">
          <div class="zp-stat-icon blue"><i class="bi bi-receipt"></i></div>
          <div class="zp-stat-label">Total Orders</div>
          <div class="zp-stat-value" id="totalOrders">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="zp-stat-card">
          <div class="zp-stat-icon green"><i class="bi bi-check-circle"></i></div>
          <div class="zp-stat-label">Successful</div>
          <div class="zp-stat-value" id="totalSuccess">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="zp-stat-card">
          <div class="zp-stat-icon amber"><i class="bi bi-currency-rupee"></i></div>
          <div class="zp-stat-label">Total Amount</div>
          <div class="zp-stat-value" id="totalAmount">—</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="zp-stat-card">
          <div class="zp-stat-icon red"><i class="bi bi-x-circle"></i></div>
          <div class="zp-stat-label">Failed</div>
          <div class="zp-stat-value" id="totalFailed">—</div>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="zp-card mb-3 p-3">
      <div class="row g-2 align-items-center">
        <div class="col-auto">
          <label class="zp-label mb-0 me-2">Filter:</label>
        </div>
        <div class="col-auto">
          <select class="zp-input py-2" id="statusFilter" style="min-width:140px">
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div class="col-auto ms-auto">
          <input type="search" class="zp-input py-2" id="searchInput" placeholder="Search order ID..." style="min-width:200px"/>
        </div>
      </div>
    </div>

    <!-- Table Card -->
    <div class="zp-card">
      <!-- Loading -->
      <div id="tableLoading" class="zp-loading">
        <div class="zp-spinner"></div>
        <span>Loading transactions...</span>
      </div>

      <!-- Empty -->
      <div id="tableEmpty" class="zp-empty d-none">
        <div class="zp-empty-icon"><i class="bi bi-receipt"></i></div>
        <div class="zp-empty-title">No payments found</div>
        <div class="zp-empty-text">Create a payment link to start receiving payments.</div>
        <a href="/payment-link.php" class="btn btn-zp-primary mt-3">Generate Payment Link</a>
      </div>

      <!-- Table -->
      <div id="tableWrap" class="d-none">
        <div class="table-responsive">
          <table class="zp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Order ID</th>
                <th>Amount</th>
                <th>UTR</th>
                <th>Status</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody id="paymentTableBody"></tbody>
          </table>
        </div>
        <div class="px-3 py-2 border-top text-muted" style="font-size:12px">
          Showing <span id="showingCount">0</span> of <span id="totalCount">0</span> transactions
        </div>
      </div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
let allPayments = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  const res = await API.get('/payment/history?limit=100');
  document.getElementById('tableLoading').classList.add('d-none');

  if (!res?.success) {
    Toast.error('Failed to load payment history');
    return;
  }

  allPayments = res.data.payments || [];

  // Summary stats
  const success = allPayments.filter(p => p.status === 'success');
  const failed  = allPayments.filter(p => p.status === 'failed');
  document.getElementById('totalOrders').textContent  = allPayments.length;
  document.getElementById('totalSuccess').textContent = success.length;
  document.getElementById('totalFailed').textContent  = failed.length;
  document.getElementById('totalAmount').textContent  = Fmt.currency(success.reduce((s,p) => s + (p.payAmount || p.amount || 0), 0));

  renderTable(allPayments);

  // Filters
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('searchInput').addEventListener('input', applyFilters);
});

function applyFilters() {
  const status = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allPayments.filter(p => {
    const matchStatus = !status || p.status === status;
    const matchSearch = !search || p.orderId.toLowerCase().includes(search);
    return matchStatus && matchSearch;
  });
  renderTable(filtered);
}

function renderTable(payments) {
  const tbody = document.getElementById('paymentTableBody');

  if (payments.length === 0) {
    document.getElementById('tableWrap').classList.add('d-none');
    document.getElementById('tableEmpty').classList.remove('d-none');
    return;
  }

  document.getElementById('tableEmpty').classList.add('d-none');
  document.getElementById('tableWrap').classList.remove('d-none');
  document.getElementById('showingCount').textContent = payments.length;
  document.getElementById('totalCount').textContent   = allPayments.length;

  tbody.innerHTML = payments.map((p, i) => `
    <tr>
      <td class="text-muted" style="font-size:12px">${i + 1}</td>
      <td><span style="font-family:monospace;font-size:12px">${p.orderId}</span></td>
      <td><strong>${Fmt.currency(p.payAmount || p.amount)}</strong></td>
      <td><span class="text-muted" style="font-size:12px">${p.utr || '—'}</span></td>
      <td>${Fmt.statusBadge(p.status)}</td>
      <td class="text-muted" style="font-size:12px;white-space:nowrap">${Fmt.datetime(p.createdAt)}</td>
    </tr>
  `).join('');
}
</script>
</body>
</html>
