import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

function getFirebaseAuth() {
  const missingConfig = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
  if (missingConfig.length > 0) {
    const error = new Error('Google sign-in is not configured for this app.');
    error.code = 'auth/configuration-missing';
    throw error;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken(true);
}

export async function clearFirebaseSession() {
  if (getApps().length === 0) return;
  await signOut(getAuth(getApp()));
}

export function getGoogleSignInErrorMessage(error) {
  const messages = {
    'auth/configuration-missing': 'Google sign-in is not configured yet.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Please allow popups and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/unauthorized-domain': 'This website is not authorized for Google sign-in.'
  };

  return messages[error?.code] || 'Google sign-in failed. Please try again.';
}
