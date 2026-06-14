// middleware/auth.js - JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const { ref } = require('../firebase/admin');
const response = require('../helpers/response');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return response.unauthorized(res, 'Token expired. Please login again.');
      }
      return response.unauthorized(res, 'Invalid token');
    }

    // Check if user still exists and is active
    const userSnap = await ref(`users/${decoded.uid}`).once('value');
    if (!userSnap.exists()) {
      return response.unauthorized(res, 'User not found');
    }

    const user = userSnap.val();

    if (user.isBanned) {
      return response.forbidden(res, 'Your account has been banned. Contact support.');
    }

    // Attach user to request
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: user.role || 'user',
    };

    next();
  } catch (err) {
    logger.error('Auth middleware error:', err.message);
    return response.serverError(res);
  }
};

/**
 * Optional auth - attach user if token present, continue either way
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { uid: decoded.uid, email: decoded.email, role: decoded.role };
    } catch {
      // Invalid token - continue as unauthenticated
    }

    next();
  } catch (err) {
    next();
  }
};

module.exports = { authenticate, optionalAuth };
