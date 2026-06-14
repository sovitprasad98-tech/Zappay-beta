// assets/js/firebase-init.js
// Firebase Client SDK Initialization
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

window.firebaseAuth     = auth;
window.googleProvider   = googleProvider;
window.firebaseSignIn   = () => signInWithPopup(auth, googleProvider);
window.firebaseSignOut  = () => signOut(auth);

// Expose auth state listener
window.onAuthStateChange = (callback) => auth.onAuthStateChanged(callback);
