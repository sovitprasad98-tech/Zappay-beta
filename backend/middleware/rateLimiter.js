// middleware/rateLimiter.js - API Rate Limiting
const rateLimit = require('express-rate-limit');
const response = require('../helpers/response');

/**
 * General API rate limiter - 100 requests per 15 minutes
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return response.error(res, 'Too many requests. Please try again later.', 429);
  },
});

/**
 * Auth rate limiter - 10 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return response.error(res, 'Too many login attempts. Please wait 15 minutes.', 429);
  },
});

/**
 * Payment creation limiter - 20 requests per 15 minutes
 */
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return response.error(res, 'Too many payment requests. Please try again later.', 429);
  },
});

/**
 * Withdrawal limiter - 5 requests per hour
 */
const withdrawalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return response.error(res, 'Too many withdrawal requests. Please try again later.', 429);
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  withdrawalLimiter,
};
