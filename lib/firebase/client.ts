import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readFirebaseWebConfig(): FirebaseWebConfig {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (
    !apiKey ||
    !authDomain ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    const missing = [
      !apiKey && "NEXT_PUBLIC_FIREBASE_API_KEY",
      !authDomain && "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      !projectId && "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      !storageBucket && "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      !messagingSenderId && "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      !appId && "NEXT_PUBLIC_FIREBASE_APP_ID",
    ].filter(Boolean);

    throw new Error(
      `Missing Firebase web config: ${missing.join(", ")}. Copy values from Firebase console → Project settings → Your apps → Web app, and set them in .env.local.`,
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

/** Singleton Firebase app for the browser (and server bundles that include this module). */
export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existing = getApps()[0];
    app = existing ?? initializeApp(readFirebaseWebConfig());
  }
  return app;
}

/** Firestore instance tied to {@link getFirebaseApp}. */
export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

/**
 * Firebase Auth tied to {@link getFirebaseApp}. Requires Authentication to be enabled
 * in the Firebase project (Console → Authentication → Get started) or custom-token sign-in returns
 * `auth/configuration-not-found`.
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}
