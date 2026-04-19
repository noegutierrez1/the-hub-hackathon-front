"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { getRedirectResult, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { Suspense, useEffect, useMemo, useState } from "react";
import HexPanel from "../components/HexPanel";
import LoadingAnimation from "@/components/LoadingAnimation";
import { createGoogleProvider, getFirebaseClientAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";

const UNIVERSITIES = [
  { id: "csumb", name: "CSUMB", hub: "The Hub" },
];

type SessionResponse = {
  user?: {
    uid: string;
    email: string;
    role: "admin" | "student";
    hubDomain: string;
    displayName: string | null;
    photoUrl: string | null;
  };
  redirectTo?: string;
  error?: string;
};

function readSafePath(path: string | null) {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function normalizeNextPath(nextPath: string | null, role: "admin" | "student") {
  const safePath = readSafePath(nextPath);
  if (!safePath) return role === "admin" ? "/admin" : "/student/inventory";
  if (role !== "admin" && safePath.startsWith("/admin")) return "/student/inventory";
  return safePath;
}

async function readApiPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();
  if (!rawText) return { json: null, text: "" };
  try {
    return { json: JSON.parse(rawText) as Record<string, unknown>, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedUniversity, setSelectedUniversity] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const nextPath = useMemo(() => readSafePath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      setIsLoadingSession(true);
      setError("");
      try {
        // Handle redirect result from signInWithRedirect (mobile fallback)
        const auth = getFirebaseClientAuth();
        const redirectResult = await getRedirectResult(auth).catch(() => null);
        if (redirectResult && !cancelled) {
          const idToken = await redirectResult.user.getIdToken(true);
          const photoUrl = redirectResult.user.photoURL ?? null;
          const response = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, photoUrl }),
          });
          const { json, text } = await readApiPayload(response);
          const payload = (json || {}) as SessionResponse;
          if (!response.ok || !payload.user) {
            const message =
              payload.error ||
              (text.trim().startsWith("<!DOCTYPE")
                ? "Received HTML instead of JSON while creating session."
                : text.slice(0, 160));
            if (!cancelled) {
              setError(message || "Login failed.");
              setIsLoadingSession(false);
            }
            return;
          }
          if (!cancelled) {
            const destination = normalizeNextPath(nextPath, payload.user.role);
            router.replace(destination);
          }
          return;
        }

        // No redirect result — check for existing session cookie
        const response = await fetch("/api/auth/session", { method: "GET" });
        const { json } = await readApiPayload(response);
        const payload = (json || {}) as SessionResponse;
        if (!response.ok || !payload.user) {
          if (!cancelled) setIsLoadingSession(false);
          return;
        }
        if (!cancelled) {
          const destination = normalizeNextPath(nextPath, payload.user.role);
          router.replace(destination);
        }
      } catch {
        if (!cancelled) setIsLoadingSession(false);
      }
    };
    void loadSession();
    return () => { cancelled = true; };
  }, [nextPath, router]);

  const handleGoogleLogin = async () => {
    if (!selectedUniversity) return;
    setError("");
    setStatus("");
    setIsLoggingIn(true);
    try {
      const auth = getFirebaseClientAuth();
      const provider = createGoogleProvider();
      let credential;
      try {
        credential = await signInWithPopup(auth, provider);
      } catch (popupError) {
        if ((popupError as { code?: string })?.code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return; // page navigates away; result handled in loadSession on return
        }
        throw popupError;
      }
      const idToken = await credential.user.getIdToken(true);
      const photoUrl = credential.user.photoURL ?? null;

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, photoUrl }),
      });

      const { json, text } = await readApiPayload(response);
      const payload = (json || {}) as SessionResponse;

      if (!response.ok || !payload.user) {
        const message =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON while creating session."
            : text.slice(0, 160));
        throw new Error(message || "Login failed.");
      }

      setStatus(`Signed in as ${payload.user.email}`);
      const destination = normalizeNextPath(nextPath, payload.user.role);
      router.replace(destination);
    } catch (signInError) {
      // Clear firebase session if login API failed
      try { await signOut(getFirebaseClientAuth()); } catch {}
      setError(signInError instanceof Error ? signInError.message : "Could not complete sign-in.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const firebaseConfigured = isFirebaseClientConfigured();

  if (isLoadingSession) {
    return (
      <div
        style={{
          minHeight: "calc(100dvh - 56px)",
          background: "var(--fp-page-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingAnimation
          message="Checking session…"
          className="py-2"
          iconClassName="h-20 w-20"
          messageClassName="mt-2 text-sm font-medium text-slate-300"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        background: "var(--fp-page-bg)",
        padding: "40px 24px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <HexPanel
          contentStyle={{
            padding: "32px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                color: "var(--fp-text-primary)",
                fontSize: "clamp(22px, 5vw, 30px)",
                fontWeight: 900,
                margin: "0 0 6px",
                letterSpacing: "-0.02em",
              }}
            >
              Open{" "}
              <span style={{ color: "var(--fp-button-accent)" }}>Shelf</span>
            </h1>
            <p
              style={{
                color: "var(--fp-text-secondary)",
                fontSize: 14,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Select your university to get started
            </p>
          </div>

          {/* University selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--fp-text-muted)",
                margin: "0 0 4px",
              }}
            >
              Select your school
            </p>
            {UNIVERSITIES.map((u) => {
              const isSelected = selectedUniversity === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUniversity(u.id)}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    borderRadius: 10,
                    border: isSelected
                      ? "2px solid var(--fp-button-accent)"
                      : "1px solid var(--fp-panel-border)",
                    background: isSelected
                      ? "rgba(var(--fp-accent-rgb, 104,148,102), 0.1)"
                      : "var(--fp-input-bg)",
                    color: isSelected
                      ? "var(--fp-button-accent)"
                      : "var(--fp-text-primary)",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{u.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isSelected
                        ? "var(--fp-button-accent)"
                        : "var(--fp-text-muted)",
                    }}
                  >
                    {u.hub}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Errors / status */}
          {!firebaseConfigured && (
            <p
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(220,38,38,0.4)",
                background: "rgba(220,38,38,0.08)",
                color: "#fca5a5",
                fontSize: 13,
                margin: 0,
              }}
            >
              Firebase config is missing. Check your environment variables.
            </p>
          )}
          {error && (
            <p
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(220,38,38,0.4)",
                background: "rgba(220,38,38,0.08)",
                color: "#fca5a5",
                fontSize: 13,
                margin: 0,
              }}
            >
              {error}
            </p>
          )}
          {status && (
            <p
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(104,148,102,0.4)",
                background: "rgba(104,148,102,0.08)",
                color: "#86efac",
                fontSize: 13,
                margin: 0,
              }}
            >
              {status}
            </p>
          )}

          {/* Sign in button */}
          <button
            type="button"
            disabled={!firebaseConfigured || isLoggingIn || !selectedUniversity}
            onClick={() => void handleGoogleLogin()}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 10,
              border: "none",
              background:
                !selectedUniversity || isLoggingIn ? "#334155" : "#e2e8f0",
              color: "#0f1825",
              fontSize: 15,
              fontWeight: 700,
              cursor:
                !firebaseConfigured || isLoggingIn || !selectedUniversity
                  ? "not-allowed"
                  : "pointer",
              opacity:
                !firebaseConfigured || isLoggingIn || !selectedUniversity
                  ? 0.6
                  : 1,
              transition: "opacity 0.15s, background 0.15s",
            }}
          >
            {isLoggingIn ? "Signing in…" : "Continue with Google"}
          </button>

          {!selectedUniversity && (
            <p
              style={{
                fontSize: 12,
                color: "var(--fp-text-muted)",
                margin: 0,
                textAlign: "center",
              }}
            >
              Select your school above to continue
            </p>
          )}
        </HexPanel>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "calc(100dvh - 56px)",
            background: "var(--fp-page-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LoadingAnimation
            message="Loading…"
            className="py-2"
            iconClassName="h-20 w-20"
            messageClassName="mt-2 text-sm font-medium"
          />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
