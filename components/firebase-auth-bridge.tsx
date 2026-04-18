"use client";

import { signInWithCustomToken, signOut } from "firebase/auth";
import { useEffect, useRef } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";

let loggedAuthConfigurationHint = false;

type Props = {
  hasAuth0Session: boolean;
};

/**
 * Keeps Firebase Auth aligned with the Auth0 session: mints a custom token on the
 * server and signs in here, or signs out of Firebase when the Auth0 session is gone.
 */
export function FirebaseAuthBridge({ hasAuth0Session }: Props) {
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (busy.current) return;
      busy.current = true;
      try {
        const auth = getFirebaseAuth();

        if (!hasAuth0Session) {
          if (auth.currentUser) {
            await signOut(auth);
          }
          return;
        }

        const res = await fetch("/api/auth/firebase-token", {
          method: "POST",
          credentials: "include",
        });

        if (res.status === 401) {
          if (auth.currentUser) {
            await signOut(auth);
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`Firebase token route returned ${res.status}`);
        }

        const body = (await res.json()) as {
          customToken: string;
          firebaseUid: string;
        };

        if (cancelled) return;

        if (auth.currentUser?.uid === body.firebaseUid) {
          return;
        }

        try {
          await signInWithCustomToken(auth, body.customToken);
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code: unknown }).code)
              : "";
          if (code === "auth/configuration-not-found") {
            if (
              process.env.NODE_ENV === "development" &&
              !loggedAuthConfigurationHint
            ) {
              loggedAuthConfigurationHint = true;
              console.warn(
                "[FirebaseAuthBridge] Firebase Authentication is not enabled for this project. Console → Authentication → Get started. " +
                  "No provider setup is required for custom tokens.",
              );
            }
            return;
          }
          throw err;
        }
      } finally {
        busy.current = false;
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [hasAuth0Session]);

  return null;
}
