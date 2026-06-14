// assets/js/auth.js
// Handles all authentication logic

const Auth = {
  TOKEN_KEY: 'zp_token',
  USER_KEY:  'zp_user',

  /* ── Store token & user after login ── */
  save(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  /* ── Get stored JWT token ── */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /* ── Get stored user object ── */
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY));
    } catch { return null; }
  },

  /* ── Check if logged in ── */
  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  },

  /* ── Clear session ── */
  clear() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  /* ── Redirect to login if not authenticated ── */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.php';
      return false;
    }
    return true;
  },

  /* ── Google Sign-In flow ── */
  async signInWithGoogle() {
    try {
      // Firebase popup sign-in
      const result = await window.firebaseSignIn();
      const idToken = await result.user.getIdToken();

      // Send to our backend for verification & JWT
      const res = await API.post('/auth/google', { idToken });

      if (res.success) {
        this.save(res.data.token, res.data.user);
        return { success: true, user: res.data.user };
      }
      return { success: false, message: res.message };
    } catch (err) {
      // Firebase popup closed by user
      if (err.code === 'auth/popup-closed-by-user') {
        return { success: false, message: 'Sign-in cancelled' };
      }
      return { success: false, message: err.message || 'Sign-in failed' };
    }
  },

  /* ── Logout ── */
  async logout() {
    try {
      await API.post('/auth/logout');
      await window.firebaseSignOut();
    } catch {}
    this.clear();
    window.location.href = '/login.php';
  },

  /* ── Refresh user data from backend ── */
  async refreshUser() {
    try {
      const res = await API.get('/auth/me');
      if (res.success) {
        const existing = this.getUser();
        this.save(this.getToken(), { ...existing, ...res.data });
        return res.data;
      }
    } catch {}
    return null;
  },
};
