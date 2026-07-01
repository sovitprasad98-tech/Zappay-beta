// routes/config.js
// Public endpoint — serves CLIENT-SAFE config (Firebase web config + site name)
// from Vercel environment variables, so the frontend never needs to
// hardcode these values. Firebase client config is designed to be public
// (it's restricted by Firebase Security Rules, not by secrecy) — this is
// different from server secrets like ZAP_KEY, which NEVER go through this
// route and NEVER reach the frontend.
const express = require('express');
const router = express.Router();
const response = require('../helpers/response');
const firebaseService = require('../services/firebaseService');

router.get('/', async (req, res) => {
  const required = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_APP_ID',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    return response.error(
      res,
      `Server misconfigured — missing env vars: ${missing.join(', ')}. Set these in Vercel → Project Settings → Environment Variables.`,
      500
    );
  }

  let socialLinks = {};
  let maintenanceMode = false;
  try {
    const settings = await firebaseService.getSettings();
    socialLinks = settings.socialLinks || {};
    maintenanceMode = !!settings.maintenanceMode;
  } catch (e) { /* settings unreachable — return empty social links rather than failing config entirely */ }

  return response.success(res, 'Config fetched', {
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL: process.env.FIREBASE_DATABASE_URL || '',
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID,
    },
    siteName: process.env.SITE_NAME || 'ZapPay',
    socialLinks,
    maintenanceMode,
  });
});

module.exports = router;
