import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let app: App | undefined;

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) {
    return s.slice(1);
  }
  return s;
}

/**
 * Supports (1) a single-line JSON string, or (2) a path to a .json file (recommended for multiline keys).
 */
function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = stripBom(raw.trim());

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as ServiceAccount;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON: ${msg}. ` +
          `Use one line in .env (with \\n in private_key), or set the variable to a file path like ./secrets/firebase-adminsdk.json and store the full JSON in that file.`,
      );
    }
  }

  const pathCandidate = trimmed.replace(/^["']|["']$/g, "");
  const pathToRead = existsSync(pathCandidate)
    ? pathCandidate
    : existsSync(resolve(process.cwd(), pathCandidate))
      ? resolve(process.cwd(), pathCandidate)
      : null;

  if (!pathToRead) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY must start with { for inline JSON, or be a path to a service account JSON file. Tried: ${pathCandidate}`,
    );
  }

  const fileJson = stripBom(readFileSync(pathToRead, "utf8").trim());
  return JSON.parse(fileJson) as ServiceAccount;
}

function initAdminApp(): App {
  if (app) {
    return app;
  }
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (key?.trim()) {
    const serviceAccount = parseServiceAccount(key);
    app = initializeApp({
      credential: cert(serviceAccount),
    });
    return app;
  }

  app = initializeApp({
    credential: applicationDefault(),
  });
  return app;
}

export function getFirebaseAdminApp(): App {
  return initAdminApp();
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
