// server.js - ZapPay Backend
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const logger = require('./utils/logger');

// Initialize Firebase — errors are logged but don't crash the server
const { initializeFirebase } = require('./firebase/admin');
initializeFirebase();

const app = express();

// Security
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// CORS
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));

// Rate limiting
const { generalLimiter } = require('./middleware/rateLimiter');
app.use('/api/', generalLimiter);

// ── Health Check (no Firebase needed) ──
app.get('/', (req, res) => {
  res.json({ name: 'ZapPay API', version: '1.0.0', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── Routes ──
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/user',         require('./routes/user'));
app.use('/api/wallet',       require('./routes/wallet'));
app.use('/api/payment',      require('./routes/payment'));
app.use('/api/payment-link', require('./routes/paymentLink'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/withdrawal',   require('./routes/withdrawal'));
app.use('/api/notification', require('./routes/notification'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/webhook',      require('./routes/webhook'));

// ── Error Handlers ──
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler.notFoundHandler);
app.use(errorHandler);

// ── Start ──
// For Vercel: module.exports must come before or alongside app.listen
// Vercel uses the exported app directly in serverless mode
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  // Local development only
  app.listen(PORT, async () => {
    logger.info(`🚀 ZapPay running on http://localhost:${PORT}`);
    try {
      const { seedDefaultPlans } = require('./services/subscriptionService');
      await seedDefaultPlans();
    } catch (e) {
      logger.error('Plan seed error: ' + e.message);
    }
  });
} else {
  // Vercel production — seed plans on first request instead
  let seeded = false;
  app.use(async (req, res, next) => {
    if (!seeded) {
      seeded = true;
      try {
        const { seedDefaultPlans } = require('./services/subscriptionService');
        await seedDefaultPlans();
      } catch (e) {
        logger.error('Plan seed error: ' + e.message);
      }
    }
    next();
  });
}

module.exports = app;
