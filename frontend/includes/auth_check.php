<?php
/**
 * Auth check for user pages
 * Redirects to login if not authenticated
 * JWT is validated client-side; PHP only checks localStorage via JS
 */
if (!defined('SITE_NAME')) {
  require_once __DIR__ . '/config.php';
}
// PHP session for extra security layer
session_start();
?>
<script>
// Client-side auth check - runs immediately before page renders
(function() {
  var token = localStorage.getItem('zp_token');
  var user  = localStorage.getItem('zp_user');
  if (!token || !user) {
    window.location.href = '/login.php';
  }
})();
</script>
