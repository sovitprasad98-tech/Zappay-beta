<?php
/**
 * ZapPay Frontend Configuration
 * Update API_URL after deploying backend to Vercel
 */

// Backend API URL (your Vercel backend URL)
define('API_URL', getenv('API_URL') ?: 'https://your-backend.vercel.app');

// Site info
define('SITE_NAME', 'ZapPay');
define('SITE_TAGLINE', 'Your Trusted Payment Partner');

// Firebase Client Config (safe to have on frontend)
define('FIREBASE_CONFIG', json_encode([
  'apiKey'            => 'AIzaSyAxKOihbtU8suTCQYaH0yu7tpbcFoop8RU',
  'authDomain'        => 'cyber-attack-c5414.firebaseapp.com',
  'databaseURL'       => 'https://cyber-attack-c5414-default-rtdb.firebaseio.com',
  'projectId'         => 'cyber-attack-c5414',
  'storageBucket'     => 'cyber-attack-c5414.firebasestorage.app',
  'messagingSenderId' => '615101021676',
  'appId'             => '1:615101021676:web:ffe86a9a13418b2b8c54c9',
]));
