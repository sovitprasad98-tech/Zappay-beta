<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Profile';
include __DIR__ . '/includes/header.php';
?>
<body data-protected="true">

<div class="zp-layout">
  <?php include __DIR__ . '/includes/sidebar.php'; ?>

  <main class="zp-main">
    <div class="zp-page-header">
      <h1 class="zp-page-title"><i class="bi bi-person me-2 text-primary"></i>My Profile</h1>
      <p class="zp-page-subtitle">Manage your account information.</p>
    </div>

    <div class="row g-4 justify-content-center">
      <div class="col-12 col-md-8 col-lg-6">

        <!-- Loading -->
        <div id="profileLoading" class="zp-loading">
          <div class="zp-spinner"></div>
          <span>Loading profile...</span>
        </div>

        <div id="profileContent" class="d-none">

          <!-- Avatar Card -->
          <div class="zp-card text-center mb-4">
            <img src="" id="profileAvatar" alt="Avatar"
                 style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--zp-border);margin:0 auto 12px;display:block"/>
            <h5 class="fw-bold mb-1" id="profileName">—</h5>
            <p class="text-muted small mb-3" id="profileEmail">—</p>
            <span class="zp-badge zp-badge-primary"><i class="bi bi-person-fill me-1"></i>Verified User</span>
          </div>

          <!-- Edit Form -->
          <div class="zp-card">
            <div class="zp-card-header">
              <span class="zp-card-title">Account Details</span>
            </div>

            <div id="profileAlert" class="zp-alert d-none mb-3"></div>

            <div class="mb-3">
              <label class="zp-label">Full Name</label>
              <input type="text" id="editName" class="zp-input" placeholder="Your name" maxlength="60"/>
            </div>

            <div class="mb-3">
              <label class="zp-label">Email Address</label>
              <input type="email" id="editEmail" class="zp-input" disabled style="opacity:.6;cursor:not-allowed"/>
              <div class="text-muted mt-1" style="font-size:12px">Email is linked to your Google account and cannot be changed.</div>
            </div>

            <div class="mb-3">
              <label class="zp-label">Mobile Number</label>
              <input type="tel" id="editPhone" class="zp-input" placeholder="10-digit mobile number" maxlength="10"/>
            </div>

            <div class="mb-4">
              <label class="zp-label">Default UPI ID</label>
              <input type="text" id="editUpi" class="zp-input" placeholder="yourname@bank"/>
              <div class="text-muted mt-1" style="font-size:12px">Used as default UPI for withdrawal requests.</div>
            </div>

            <button class="btn btn-zp-primary w-100" id="saveProfileBtn">
              <span id="saveBtnText"><i class="bi bi-check-lg me-1"></i>Save Changes</span>
              <span id="saveBtnLoading" class="d-none">
                <span class="spinner-border spinner-border-sm me-1"></span>Saving...
              </span>
            </button>
          </div>

          <!-- Account Info -->
          <div class="zp-card mt-4">
            <div class="zp-card-header">
              <span class="zp-card-title">Account Info</span>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span class="text-muted small">Member Since</span>
              <span class="small fw-semibold" id="memberSince">—</span>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span class="text-muted small">Last Login</span>
              <span class="small fw-semibold" id="lastLogin">—</span>
            </div>
            <div class="d-flex justify-content-between py-2">
              <span class="text-muted small">Account Status</span>
              <span class="zp-badge zp-badge-success"><i class="bi bi-shield-check"></i>Active</span>
            </div>
          </div>

          <!-- Logout -->
          <div class="mt-4 text-center">
            <button class="btn btn-sm text-danger d-flex align-items-center gap-2 mx-auto" id="logoutBtnProfile">
              <i class="bi bi-box-arrow-right"></i>Sign out of ZapPay
            </button>
          </div>

        </div>
      </div>
    </div>
  </main>
</div>

<?php include __DIR__ . '/includes/footer.php'; ?>
<script src="/assets/js/auth.js"></script>
<script>
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  const res = await API.get('/auth/me');
  document.getElementById('profileLoading').classList.add('d-none');
  document.getElementById('profileContent').classList.remove('d-none');

  if (!res?.success) { Toast.error('Failed to load profile'); return; }
  const user = res.data;

  // Populate fields
  document.getElementById('profileAvatar').src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName||'U')}&background=2563EB&color=fff&size=80`;
  document.getElementById('profileName').textContent  = user.displayName || '—';
  document.getElementById('profileEmail').textContent = user.email;
  document.getElementById('editName').value  = user.displayName || '';
  document.getElementById('editEmail').value = user.email;
  document.getElementById('editPhone').value = user.phone || '';
  document.getElementById('editUpi').value   = user.upiId || '';
  document.getElementById('memberSince').textContent = Fmt.date(user.createdAt);
  document.getElementById('lastLogin').textContent   = Fmt.datetime(user.lastLoginAt);

  // Save
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const alertEl = document.getElementById('profileAlert');
    alertEl.classList.add('d-none');

    const name  = document.getElementById('editName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const upiId = document.getElementById('editUpi').value.trim();

    if (phone && !/^\d{10}$/.test(phone)) {
      alertEl.className = 'zp-alert zp-alert-danger mb-3';
      alertEl.textContent = 'Enter a valid 10-digit mobile number';
      alertEl.classList.remove('d-none');
      return;
    }

    document.getElementById('saveBtnText').classList.add('d-none');
    document.getElementById('saveBtnLoading').classList.remove('d-none');
    document.getElementById('saveProfileBtn').disabled = true;

    const saveRes = await API.put('/user/profile', { displayName: name, phone, upiId });

    document.getElementById('saveBtnText').classList.remove('d-none');
    document.getElementById('saveBtnLoading').classList.add('d-none');
    document.getElementById('saveProfileBtn').disabled = false;

    if (saveRes?.success) {
      Toast.success('Profile updated successfully!');
      // Update local cache
      const cached = Auth.getUser();
      Auth.save(Auth.getToken(), { ...cached, displayName: name });
    } else {
      alertEl.className = 'zp-alert zp-alert-danger mb-3';
      alertEl.textContent = saveRes?.message || 'Failed to save profile';
      alertEl.classList.remove('d-none');
    }
  });

  document.getElementById('logoutBtnProfile')?.addEventListener('click', () => Auth.logout());
});
</script>
</body>
</html>
