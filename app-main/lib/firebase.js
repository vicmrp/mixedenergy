import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let firebaseApp;
let db;
let auth;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase services conditionally on client-side
if (typeof window !== 'undefined') {
  // Client-side execution (browser)
  if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApp();
  }

  // Initialize Firestore with the new persistence method
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache()  // This enables local caching
  });

  auth = getAuth(firebaseApp);  // Initialize Firebase Auth
}

export { firebaseApp, db, auth };
