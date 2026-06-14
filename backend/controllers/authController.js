// controllers/authController.js - Authentication Controller
const jwt = require('jsonwebtoken');
const { getAuth } = require('../firebase/admin');
const firebaseService = require('../services/firebaseService');
const response = require('../helpers/response');
const logger = require('../utils/logger');
const { ROLES } = require('../config/constants');

/**
 * POST /api/auth/google
 * Verify Google Firebase ID token, upsert user, return JWT
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return response.error(res, 'Firebase ID token is required');
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      logger.warn(`Invalid Firebase token: ${err.message}`);
      return response.unauthorized(res, 'Invalid or expired token. Please sign in again.');
    }

    const { uid, email, name, picture } = decodedToken;

    // Check if user is banned before creating session
    const existingUser = await firebaseService.getUser(uid);
    if (existingUser?.isBanned) {
      return response.forbidden(res, 'Your account has been suspended. Contact support.');
    }

    // Check maintenance mode
    const settings = await firebaseService.getSettings();
    if (settings.maintenanceMode && existingUser?.role !== ROLES.ADMIN) {
      return response.error(res, 'Platform is under maintenance. Please try again later.', 503);
    }

    // Create or update user in Firebase RTDB
    const user = await firebaseService.upsertUser(uid, {
      email,
      displayName: name || email,
      photoURL: picture || '',
    });

    // Generate JWT
    const token = jwt.sign(
      { uid, email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // Log activity
    await firebaseService.logActivity(uid, 'LOGIN', {
      method: 'google',
      ip: req.ip,
    });

    logger.info(`User logged in: ${email} (${uid})`);

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
    logger.error('Google auth error:', err.message);
    return response.serverError(res, 'Authentication failed. Please try again.');
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
const getMe = async (req, res) => {
  try {
    const user = await firebaseService.getUser(req.user.uid);
    if (!user) return response.notFound(res, 'User not found');

    return response.success(res, 'User data fetched', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      phone: user.phone || '',
      upiId: user.upiId || '',
      role: user.role,
      walletBalance: user.wallet?.balance || 0,
      createdAt: user.createdAt,
    });
  } catch (err) {
    logger.error('Get me error:', err.message);
    return response.serverError(res);
  }
};

/**
 * POST /api/auth/logout
 * Logout (JWT is stateless; just log the activity)
 */
const logout = async (req, res) => {
  try {
    await firebaseService.logActivity(req.user.uid, 'LOGOUT', { ip: req.ip });
    return response.success(res, 'Logged out successfully');
  } catch (err) {
    return response.success(res, 'Logged out');
  }
};

module.exports = { googleAuth, getMe, logout };
