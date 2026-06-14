<?php
if (!defined('SITE_NAME')) require_once __DIR__ . '/config.php';
$pageTitle = isset($pageTitle) ? $pageTitle . ' — ' . SITE_NAME : SITE_NAME;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="ZapPay - Reseller Payment Link Platform" />
  <meta name="theme-color" content="#ffffff" />
  <title><?= htmlspecialchars($pageTitle) ?></title>

  <!-- Favicon -->
  <link rel="icon" href="/assets/img/favicon.ico" type="image/x-icon" />

  <!-- Google Fonts: Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

  <!-- Bootstrap 5 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" />

  <!-- Bootstrap Icons -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" />

  <!-- Custom CSS -->
  <link rel="stylesheet" href="/assets/css/main.css" />

  <!-- Firebase Config (injected for JS) -->
  <script>
    const FIREBASE_CONFIG = <?= FIREBASE_CONFIG ?>;
    const API_URL = '<?= API_URL ?>';
    const SITE_NAME = '<?= SITE_NAME ?>';
  </script>
</head>
<body>
