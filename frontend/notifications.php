<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Notifications';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div>
        <h1 class="zp-page-title"><i class="bi bi-bell me-2 text-primary"></i>Notifications</h1>
        <p class="zp-page-subtitle">Your latest alerts and updates.</p>
      </div>
      <button class="btn btn-zp-outline btn-sm" id="markAllBtn">
        <i class="bi bi-check-all me-1"></i>Mark all read
      </button>
    </div>

    <div class="zp-card">
      <!-- Loading -->
      <div id="notifLoading" class="zp-loading">
        <div class="zp-spinner"></div>
        <span>Loading notifications...</span>
      </div>

      <!-- Empty -->
      <div id="notifEmpty" class="zp-empty d-none">
        <div class="zp-empty-icon"><i class="bi bi-bell-slash"></i></div>
        <div class="zp-empty-title">No notifications</div>
        <div class="zp-empty-text">You're all caught up! We'll notify you about payments and withdrawals.</div>
      </div>

      <!-- List -->
      <div id="notifList" class="d-none"></div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
const ICONS = {
  payment:    ['bi-currency-rupee', 'payment'],
  withdrawal: ['bi-arrow-up-right-circle', 'withdrawal'],
  general:    ['bi-bell', 'general'],
  system:     ['bi-gear', 'general'],
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  loadNotifications();

  document.getElementById('markAllBtn').addEventListener('click', async () => {
    await API.put('/notification/read-all');
    Toast.success('All marked as read');
    loadNotifications();
  });
});

async function loadNotifications() {
  document.getElementById('notifLoading').classList.remove('d-none');
  document.getElementById('notifList').classList.add('d-none');
  document.getElementById('notifEmpty').classList.add('d-none');

  const res = await API.get('/notification/list?limit=50');
  document.getElementById('notifLoading').classList.add('d-none');

  if (!res?.success) { Toast.error('Failed to load notifications'); return; }

  const notifs = res.data.notifications || [];
  if (notifs.length === 0) {
    document.getElementById('notifEmpty').classList.remove('d-none');
    return;
  }

  const listEl = document.getElementById('notifList');
  listEl.classList.remove('d-none');
  listEl.innerHTML = notifs.map(n => {
    const [icon, type] = ICONS[n.type] || ICONS.general;
    return `
      <div class="zp-notif-item ${!n.isRead ? 'unread' : ''}" data-id="${n.id}" onclick="markRead('${n.id}', this)">
        <div class="zp-notif-icon ${type}"><i class="bi ${icon}"></i></div>
        <div class="flex-grow-1">
          <div class="fw-semibold" style="font-size:13.5px">${n.title}</div>
          <div class="text-muted" style="font-size:12.5px;margin-top:2px">${n.message}</div>
          <div class="text-muted mt-1" style="font-size:11px">${Fmt.timeAgo(n.createdAt)}</div>
        </div>
        ${!n.isRead ? '<div class="flex-shrink-0" style="width:8px;height:8px;background:var(--zp-primary);border-radius:50%;margin-top:4px"></div>' : ''}
      </div>`;
  }).join('');
}

async function markRead(id, el) {
  if (!el.classList.contains('unread')) return;
  el.classList.remove('unread');
  el.querySelector('[style*="background:var(--zp-primary)"]')?.remove();
  await API.put(`/notification/read/${id}`);
}
</script>
</body>
</html>
