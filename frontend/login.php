<?php
require_once __DIR__ . '/includes/config.php';
$pageTitle = 'Login';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title><?= SITE_NAME ?> — Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css"/>
  <link rel="stylesheet" href="/assets/css/main.css"/>
  <script>
    const FIREBASE_CONFIG = <?= FIREBASE_CONFIG ?>;
    const API_URL = '<?= API_URL ?>';
  </script>
</head>
<body>

<!-- Redirect if already logged in -->
<script>
  if (localStorage.getItem('zp_token') && localStorage.getItem('zp_user')) {
    window.location.href = '/dashboard.php';
  }
</script>

<div class="zp-auth-page">
  <div class="zp-auth-card">

    <!-- Logo -->
    <div class="zp-auth-logo">Z</div>

    <h1 class="zp-auth-title"><?= SITE_NAME ?></h1>
    <p class="zp-auth-subtitle">Your trusted payment reseller platform</p>

    <!-- Error Alert -->
    <div id="alertBox" class="zp-alert zp-alert-danger d-none mb-3" role="alert">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span id="alertMsg"></span>
    </div>

    <!-- Google Sign-In Button -->
    <button class="btn-google mb-4" id="googleBtn">
      <svg width="20" height="20" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.3 1.2 8.4 3.1l6.3-6.3C35 3 29.9 1 24 1 14.7 1 6.7 6.5 3 14.4l7.3 5.7C12.1 13.4 17.5 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17z" wait/>
        <path fill="#FBBC05" d="M10.3 28.7A14.9 14.9 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7L3 13.6A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.5 10.6l7.8-5.9z"/>
        <path fill="#34A853" d="M24 47c5.9 0 10.9-1.9 14.5-5.2l-7.4-5.7c-2 1.4-4.6 2.2-7.1 2.2-6.5 0-12-4-13.9-9.6L2.5 34.5C6.2 42.5 14.5 47 24 47z"/>
      </svg>
      <span id="googleBtnText">Continue with Google</span>
    </button>

    <!-- Loading state -->
    <div id="loadingState" class="d-none text-center py-2">
      <div class="zp-spinner mx-auto mb-2" style="width:28px;height:28px;border-width:2px"></div>
      <p class="text-muted small mb-0">Signing you in...</p>
    </div>

    <p class="text-muted mt-3 mb-0" style="font-size:12px">
      By continuing, you agree to our
      <a href="#" class="text-decoration-none" style="color:var(--zp-primary)">Terms</a> &
      <a href="#" class="text-decoration-none" style="color:var(--zp-primary)">Privacy Policy</a>
    </p>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="/assets/js/main.js"></script>
<script src="/assets/js/auth.js"></script>
<script type="module" src="/assets/js/firebase-init.js"></script>

<script>
const googleBtn   = document.getElementById('googleBtn');
const loadingState = document.getElementById('loadingState');
const alertBox    = document.getElementById('alertBox');
const alertMsg    = document.getElementById('alertMsg');

function showError(msg) {
  alertBox.classList.remove('d-none');
  alertMsg.textContent = msg;
  googleBtn.classList.remove('d-none');
  loadingState.classList.add('d-none');
}

googleBtn.addEventListener('click', async () => {
  googleBtn.classList.add('d-none');
  alertBox.classList.add('d-none');
  loadingState.classList.remove('d-none');

  // Wait for Firebase to init
  let tries = 0;
  while (!window.firebaseSignIn && tries < 20) {
    await new Promise(r => setTimeout(r, 100));
    tries++;
  }

  if (!window.firebaseSignIn) {
    return showError('Firebase failed to load. Please refresh.');
  }

  const result = await Auth.signInWithGoogle();

  if (result.success) {
    window.location.href = '/dashboard.php';
  } else if (result.message !== 'Sign-in cancelled') {
    showError(result.message || 'Sign-in failed. Try again.');
  } else {
    googleBtn.classList.remove('d-none');
    loadingState.classList.add('d-none');
  }
});
</script>
</body>
</html>
