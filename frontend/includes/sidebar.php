<?php
$currentPage = basename($_SERVER['PHP_SELF'], '.php');
$navItems = [
  ['page' => 'dashboard',       'icon' => 'bi-grid-fill',         'label' => 'Dashboard'],
  ['page' => 'wallet',          'icon' => 'bi-wallet2',           'label' => 'Wallet'],
  ['page' => 'payment-link',    'icon' => 'bi-link-45deg',        'label' => 'Payment Link'],
  ['page' => 'payment-history', 'icon' => 'bi-clock-history',     'label' => 'Transactions'],
  ['page' => 'withdrawal',      'icon' => 'bi-arrow-up-right-circle', 'label' => 'Withdraw'],
  ['page' => 'notifications',   'icon' => 'bi-bell',              'label' => 'Notifications'],
  ['page' => 'profile',         'icon' => 'bi-person',            'label' => 'Profile'],
];
?>

<!-- Mobile Top Navbar -->
<nav class="navbar navbar-light bg-white border-bottom d-lg-none sticky-top px-3 zp-mobile-nav">
  <button class="btn btn-link p-0 text-dark" id="sidebarToggle">
    <i class="bi bi-list fs-4"></i>
  </button>
  <span class="fw-semibold fs-6"><?= SITE_NAME ?></span>
  <a href="/notifications.php" class="btn btn-link p-0 text-dark position-relative">
    <i class="bi bi-bell fs-5"></i>
    <span class="notif-badge badge bg-danger rounded-pill position-absolute d-none" id="mobileNotifBadge" style="top:-2px;right:-4px;font-size:9px">0</span>
  </a>
</nav>

<!-- Sidebar Overlay (mobile) -->
<div class="zp-sidebar-overlay d-lg-none" id="sidebarOverlay"></div>

<!-- Sidebar -->
<aside class="zp-sidebar" id="sidebar">
  <!-- Brand -->
  <div class="zp-sidebar-brand">
    <div class="d-flex align-items-center gap-2">
      <div class="zp-logo-circle">Z</div>
      <span class="fw-bold fs-5"><?= SITE_NAME ?></span>
    </div>
    <button class="btn btn-link p-0 text-muted d-lg-none" id="sidebarClose">
      <i class="bi bi-x-lg"></i>
    </button>
  </div>

  <!-- User Mini Card -->
  <div class="zp-user-mini mx-3 mb-3">
    <img src="" alt="User" class="zp-avatar" id="sidebarAvatar" />
    <div class="flex-grow-1 overflow-hidden">
      <div class="fw-semibold text-truncate text-dark small" id="sidebarName">Loading...</div>
      <div class="text-muted" style="font-size:11px" id="sidebarEmail">—</div>
    </div>
  </div>

  <!-- Wallet Balance Pill -->
  <div class="zp-wallet-pill mx-3 mb-3">
    <i class="bi bi-wallet2"></i>
    <span>₹</span><span id="sidebarBalance">0.00</span>
  </div>

  <!-- Nav Items -->
  <nav class="zp-nav">
    <?php foreach ($navItems as $item): ?>
      <?php $isActive = ($currentPage === $item['page']); ?>
      <a href="/<?= $item['page'] ?>.php"
         class="zp-nav-item <?= $isActive ? 'active' : '' ?>">
        <i class="bi <?= $item['icon'] ?>"></i>
        <span><?= $item['label'] ?></span>
        <?php if ($item['page'] === 'notifications'): ?>
          <span class="badge bg-danger ms-auto rounded-pill d-none" id="sidebarNotifBadge">0</span>
        <?php endif; ?>
      </a>
    <?php endforeach; ?>
  </nav>

  <!-- Logout at bottom -->
  <div class="mt-auto p-3 border-top">
    <button class="btn btn-sm w-100 text-start text-danger d-flex align-items-center gap-2" id="logoutBtn">
      <i class="bi bi-box-arrow-right"></i> Sign Out
    </button>
  </div>
</aside>
