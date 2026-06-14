// firebase/admin.js - Firebase Admin SDK Initialization
const admin = require('firebase-admin');
const logger = require('../utils/logger');

let db;

/**
 * Initialize Firebase Admin SDK
 * Called once when server starts
 */
function initializeFirebase() {
  try {
    if (admin.apps.length > 0) {
      db = admin.apps[0].database();
      return;
    }

    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    db = admin.database();
    logger.info('✅ Firebase Admin SDK initialized');
  } catch (error) {
    logger.error('❌ Firebase initialization failed:', error.message);
    process.exit(1);
  }
}

/**
 * Get Firebase Auth instance
 */
function getAuth() {
  return admin.auth();
}

/**
 * Get Firebase Realtime Database instance
 */
function getDatabase() {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

/**
 * Get a database reference
 * @param {string} path - Database path
 */
function ref(path) {
  return getDatabase().ref(path);
}

/**
 * Server timestamp value for Firebase
 */
function serverTimestamp() {
  return admin.database.ServerValue.TIMESTAMP;
}

module.exports = {
  initializeFirebase,
  getAuth,
  getDatabase,
  ref,
  serverTimestamp,
  admin,
};
