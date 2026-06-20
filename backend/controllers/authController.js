// controllers/authController.js
const jwt = require('jsonwebtoken');
const { getAuth } = require('../firebase/admin');
const firebaseService = require('../services/firebaseService');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/**
 * POST /api/auth/google
 * Works for ALL Firebase auth methods:
 * - Google Sign-In
 * - Email/Password Sign-In
 * - Email/Password Register
 * Firebase issues same ID token format for all methods.
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return response.error(res, 'Firebase ID token is required');

    // Verify Firebase ID token (works for any Firebase auth provider)
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      logger.warn(`Invalid Firebase token: ${err.message}`);
      return response.unauthorized(res, 'Invalid or expired token. Please sign in again.');
    }

    const { uid, email, name, picture, firebase } = decodedToken;

    // Check maintenance mode
    const settings = await firebaseService.getSettings();
    const existingUser = await firebaseService.getUser(uid);

    if (existingUser?.isBanned) {
      return response.forbidden(res, 'Your account has been suspended. Contact support.');
    }

    if (settings.maintenanceMode && existingUser?.role !== 'admin') {
      return response.error(res, 'Platform is under maintenance. Please try again later.', 503);
    }

    // Upsert user — works for both Google and Email/Password
    const user = await firebaseService.upsertUser(uid, {
      email,
      displayName: name || email?.split('@')[0] || 'User',
      photoURL: picture || '',
      authProvider: firebase?.sign_in_provider || 'unknown',
    });

    // Generate JWT
    const token = jwt.sign(
      { uid, email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    await firebaseService.logActivity(uid, 'LOGIN', {
      method: firebase?.sign_in_provider || 'unknown',
      ip: req.ip,
    });

    logger.info(`User logged in: ${email} [${firebase?.sign_in_provider}]`);

    return response.success(res, 'Login successful', {
      token,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        walletBalance: user.wallet?.balance || 0,
      },
    });
  } catch (err) {
    logger.error('Auth error:', err.message);
    return response.serverError(res, 'Authentication failed. Please try again.');
  }
};

/** GET /api/auth/me */
const getMe = async (req, res) => {
  try {
    const user = await firebaseService.getUser(req.user.uid);
    if (!user) return response.notFound(res, 'User not found');
    return response.success(res, 'User fetched', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      phone: user.phone || '',
      upiId: user.upiId || '',
      role: user.role,
      walletBalance: user.wallet?.balance || 0,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (err) {
    return response.serverError(res, err.message);
  }
};

/** POST /api/auth/logout */
const logout = async (req, res) => {
  try {
    await firebaseService.logActivity(req.user.uid, 'LOGOUT', { ip: req.ip });
  } catch {}
  return response.success(res, 'Logged out successfully');
};

module.exports = { googleAuth, getMe, logout };
