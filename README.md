# ZapPay — Reseller Payment Link Platform

A full-stack payment reseller platform built with **Node.js + Express** (backend), **PHP + HTML/CSS/JS** (frontend), and **Firebase RTDB** as the database.

---

## 🗂️ Project Structure

```
zappay/
├── backend/         → Node.js Express API (deploy to Vercel)
├── frontend/        → PHP + HTML user panel (deploy to PHP host)
├── firebase/        → Firebase RTDB security rules
└── README.md
```

---

## ⚡ Quick Setup

### Step 1 — Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Open project `cyber-attack-c5414`
3. **Enable Google Sign-In**: Authentication → Sign-in methods → Google → Enable
4. **Apply RTDB Rules**: Realtime Database → Rules → paste `firebase/database.rules.json`
5. **Service Account**: Project Settings → Service Accounts → Generate new private key → Download JSON

### Step 2 — Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-frontend.com
JWT_SECRET=your_super_strong_32_char_secret_here
FIREBASE_PROJECT_ID=cyber-attack-c5414
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@cyber-attack-c5414.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://cyber-attack-c5414-default-rtdb.firebaseio.com
ZAP_KEY=zap5595c8a1953ecaf3dee32595a40dc5cc
ZAP_API_URL=https://pay.zapupi.com/api
WEBHOOK_URL=https://your-backend.vercel.app/api/webhook/zap
MIN_WITHDRAWAL=100
COMMISSION_PERCENT=5
```

Test locally:
```bash
npm run dev
# Runs on http://localhost:3000
```

### Step 3 — Frontend Setup

1. Open `frontend/includes/config.php`
2. Update `API_URL` with your deployed backend URL:
```php
define('API_URL', 'https://your-backend.vercel.app');
```

---

## 🚀 Deployment

### Backend → Vercel

```bash
cd backend
npm install -g vercel
vercel login
vercel --prod
```

Set these environment variables in Vercel Dashboard → Settings → Environment Variables:
- All keys from `.env` file (except PORT)

### Frontend → Any PHP Host (cPanel/Hostinger/etc.)

Upload all files from `frontend/` to your PHP hosting root (usually `public_html/`).

> **Note:** Vercel does not natively support PHP. Use cPanel, Hostinger, or any PHP 7.4+ host for the frontend.

---

## 🔒 Setting Admin Account

After deploying and logging in:

1. Open Firebase Console → Realtime Database
2. Find your user under `/users/{uid}`
3. Change `role` from `"user"` to `"admin"`

That's it — you now have full admin access.

---

## 💳 Payment Flow

```
User creates payment link
        ↓
Backend calls Zap UPI API (ZAP_KEY never exposed to frontend)
        ↓
Customer opens payment URL in same tab
        ↓
Customer pays via UPI
        ↓
Zap sends webhook to /api/webhook/zap
        ↓
Backend verifies via order-status API
        ↓
Wallet credited via Firebase transaction
        ↓
User gets notification
```

---

## 🔐 Security Features

- JWT authentication (30-day tokens)
- Firebase ID token verification
- Zap UPI key stored server-side only
- Firebase transactions prevent duplicate wallet credits
- `processedOrders` node prevents double-processing
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configured
- Helmet.js security headers

---

## 📋 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google` | Login with Google Firebase token |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet/balance` | Get wallet balance |

### Payment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment/create-order` | Create Zap UPI order |
| GET  | `/api/payment/status/:orderId` | Get payment status |
| GET  | `/api/payment/history` | Payment history |

### Withdrawal
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/withdrawal/request` | Submit withdrawal |
| GET  | `/api/withdrawal/history` | Withdrawal history |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/notification/list` | Get notifications |
| GET  | `/api/notification/count` | Unread count |
| PUT  | `/api/notification/read/:id` | Mark as read |
| PUT  | `/api/notification/read-all` | Mark all read |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/admin/dashboard` | Dashboard stats |
| GET  | `/api/admin/users` | All users |
| POST | `/api/admin/users/:uid/ban` | Ban/unban user |
| POST | `/api/admin/wallet/adjust` | Manual credit/debit |
| GET  | `/api/admin/payments` | All payments |
| GET  | `/api/admin/withdrawals` | All withdrawals |
| PUT  | `/api/admin/withdrawals/:id/approve` | Approve withdrawal |
| PUT  | `/api/admin/withdrawals/:id/reject` | Reject + refund |
| GET  | `/api/admin/settings` | Platform settings |
| PUT  | `/api/admin/settings` | Update settings |
| POST | `/api/admin/notifications/send` | Broadcast notification |

### Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/zap` | Zap UPI webhook receiver |

---

## 🌐 Firebase RTDB Structure

```
/users/{uid}/
  email, displayName, photoURL, role
  wallet/balance
  isBanned, createdAt, lastLoginAt

/payments/{orderId}/
  userId, amount, status, txnId, utr
  environment, createdAt, updatedAt

/withdrawals/{id}/
  userId, amount, commission, netAmount
  upiId, status, adminNote

/notifications/{uid}/{notifId}/
  title, message, type, isRead

/settings/
  minWithdrawal, commissionPercent
  maintenanceMode, siteName

/processedOrders/{orderId}/  ← duplicate prevention
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | PHP 7.4+, HTML5, Bootstrap 5, Vanilla JS |
| Backend | Node.js 18+, Express.js |
| Database | Firebase Realtime Database |
| Auth | Firebase Authentication (Google) |
| Payment | Zap UPI Gateway |
| Deployment | Vercel (backend), Any PHP host (frontend) |
