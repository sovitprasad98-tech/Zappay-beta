  <!-- Bootstrap 5 JS -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <!-- Firebase SDK -->
  <script type="module" src="/assets/js/firebase-init.js"></script>

  <!-- Main App JS -->
  <script src="/assets/js/main.js"></script>

  <?php if (isset($extraScripts)): ?>
    <?php foreach ($extraScripts as $script): ?>
      <script src="<?= htmlspecialchars($script) ?>"></script>
    <?php endforeach; ?>
  <?php endif; ?>
</body>
</html>
