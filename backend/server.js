// server.js - ZapPay Backend Entry Point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const logger = require('./utils/logger');
const { initializeFirebase } = require('./firebase/admin');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Initialize Firebase Admin SDK
initializeFirebase();

const app = express();

// ===========================
// SECURITY MIDDLEWARE
// ===========================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
      : ['*'];

    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ===========================
// BODY PARSING
// ===========================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ===========================
// LOGGING
// ===========================
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ===========================
// RATE LIMITING (global)
// ===========================
app.use('/api/', generalLimiter);

// ===========================
// HEALTH CHECK
// ===========================
app.get('/', (req, res) => {
  res.json({ name: 'ZapPay API', version: '1.0.0', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ===========================
// API ROUTES
// ===========================
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/user',         require('./routes/user'));
app.use('/api/wallet',       require('./routes/wallet'));
app.use('/api/payment',      require('./routes/payment'));
app.use('/api/withdrawal',   require('./routes/withdrawal'));
app.use('/api/notification', require('./routes/notification'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/webhook',      require('./routes/webhook'));

// ===========================
// 404 + ERROR HANDLERS
// ===========================
app.use(errorHandler.notFoundHandler);
app.use(errorHandler);

// ===========================
// START SERVER
// ===========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 ZapPay Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
