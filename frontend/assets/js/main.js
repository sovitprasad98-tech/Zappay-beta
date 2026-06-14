// assets/js/main.js
// Shared utilities used across all pages

/* ==============================
   API HELPER
   ============================== */
const API = {
  baseURL: window.API_URL || '',

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('zp_token');
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  async _request(method, path, body) {
    try {
      const opts = { method, headers: this._headers() };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(this.baseURL + '/api' + path, opts);
      const data = await res.json();

      // Auto-logout on 401
      if (res.status === 401) {
        Auth.clear();
        window.location.href = '/login.php';
        return;
      }
      return data;
    } catch (err) {
      return { success: false, message: 'Network error. Please check connection.' };
    }
  },

  get(path)         { return this._request('GET',    path); },
  post(path, body)  { return this._request('POST',   path, body); },
  put(path, body)   { return this._request('PUT',    path, body); },
  delete(path)      { return this._request('DELETE', path); },
};

/* ==============================
   TOAST NOTIFICATIONS
   ============================== */
const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.className = 'zp-toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  show(message, type = 'info', duration = 4000) {
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
    const colors = { success: '#16A34A', error: '#DC2626', warning: '#D97706', info: '#2563EB' };

    const el = document.createElement('div');
    el.className = `zp-toast ${type}`;
    el.innerHTML = `
      <i class="bi ${icons[type] || icons.info}" style="color:${colors[type]};font-size:18px;flex-shrink:0"></i>
      <span style="flex:1;line-height:1.4">${message}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;line-height:1"><i class="bi bi-x"></i></button>
    `;
    this._getContainer().appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); },
};

/* ==============================
   FORMAT HELPERS
   ============================== */
const Fmt = {
  currency(amount) {
    return '₹' + parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  date(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  datetime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  },

  statusBadge(status) {
    const map = {
      success:  ['zp-badge-success', 'bi-check-circle',   'Success'],
      failed:   ['zp-badge-danger',  'bi-x-circle',       'Failed'],
      pending:  ['zp-badge-warning', 'bi-clock',          'Pending'],
      approved: ['zp-badge-success', 'bi-check-circle',   'Approved'],
      rejected: ['zp-badge-danger',  'bi-x-circle',       'Rejected'],
      timeout:  ['zp-badge-gray',    'bi-hourglass',      'Timeout'],
    };
    const [cls, icon, label] = map[status] || ['zp-badge-gray', 'bi-circle', status];
    return `<span class="zp-badge ${cls}"><i class="bi ${icon}"></i>${label}</span>`;
  },
};

/* ==============================
   SIDEBAR INIT
   ============================== */
function initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('sidebarToggle');
  const closeBtn  = document.getElementById('sidebarClose');

  if (!sidebar) return;

  const open  = () => { sidebar.classList.add('open'); overlay?.classList.add('open'); };
  const close = () => { sidebar.classList.remove('open'); overlay?.classList.remove('open'); };

  toggleBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  // Populate sidebar user info
  const user = Auth.getUser();
  if (user) {
    const nameEl    = document.getElementById('sidebarName');
    const emailEl   = document.getElementById('sidebarEmail');
    const avatarEl  = document.getElementById('sidebarAvatar');
    if (nameEl)   nameEl.textContent  = user.displayName || user.email;
    if (emailEl)  emailEl.textContent = user.email;
    if (avatarEl) {
      avatarEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'U')}&background=2563EB&color=fff&size=64`;
    }
  }

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => Auth.logout());

  // Load wallet balance in sidebar
  loadSidebarBalance();

  // Load unread notification count
  loadNotifCount();
}

async function loadSidebarBalance() {
  const el = document.getElementById('sidebarBalance');
  if (!el) return;
  try {
    const res = await API.get('/wallet/balance');
    if (res?.success) {
      el.textContent = parseFloat(res.data.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    }
  } catch {}
}

async function loadNotifCount() {
  try {
    const res = await API.get('/notification/count');
    if (res?.success && res.data.unreadCount > 0) {
      const c = res.data.unreadCount;
      const sidebarBadge = document.getElementById('sidebarNotifBadge');
      const mobileBadge  = document.getElementById('mobileNotifBadge');
      if (sidebarBadge) { sidebarBadge.textContent = c; sidebarBadge.classList.remove('d-none'); }
      if (mobileBadge)  { mobileBadge.textContent  = c; mobileBadge.classList.remove('d-none'); }
    }
  } catch {}
}

/* ==============================
   DOM READY
   ============================== */
document.addEventListener('DOMContentLoaded', () => {
  // Auth guard for protected pages
  if (document.body.dataset.protected === 'true') {
    if (!Auth.requireAuth()) return;
    initSidebar();
  }
});
