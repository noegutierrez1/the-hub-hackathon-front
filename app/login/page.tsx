"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithPopup, signOut } from "firebase/auth";
import { Suspense, useEffect, useMemo, useState } from "react";

import LoadingAnimation from "@/components/LoadingAnimation";
import { createGoogleProvider, getFirebaseClientAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";

type SessionResponse = {
  user?: {
    uid: string;
    email: string;
    role: "admin" | "student";
    hubDomain: string;
    displayName: string | null;
  };
  redirectTo?: string;
  error?: string;
};

function readSafePath(path: string | null) {
  if (!path) {
    return null;
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  return path;
}

function normalizeNextPath(nextPath: string | null, role: "admin" | "student") {
  const safePath = readSafePath(nextPath);
  if (!safePath) {
    return role === "admin" ? "/admin" : "/student/inventory";
  }

  if (role !== "admin" && safePath.startsWith("/admin")) {
    return "/student/inventory";
  }

  return safePath;
}

async function readApiPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();
  if (!rawText) {
    return { json: null, text: "" };
  }

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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionResponse["user"] | null>(null);

  const nextPath = useMemo(() => readSafePath(searchParams.get("next")), [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setIsLoadingSession(true);
      setError("");

      try {
        const response = await fetch("/api/auth/session", { method: "GET" });
        const { json } = await readApiPayload(response);
        const payload = (json || {}) as SessionResponse;

        if (!response.ok) {
          if (!cancelled) {
            setSessionUser(null);
          }
          return;
        }

        if (!payload.user) {
          if (!cancelled) {
            setSessionUser(null);
          }
          return;
        }

        if (!cancelled) {
          setSessionUser(payload.user);
          const destination = normalizeNextPath(nextPath, payload.user.role);
          router.replace(destination);
        }
      } catch {
        if (!cancelled) {
          setError("Could not check your existing session.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSession(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  const handleGoogleLogin = async () => {
    setError("");
    setStatus("");
    setIsLoggingIn(true);

    try {
      const auth = getFirebaseClientAuth();
      const credential = await signInWithPopup(auth, createGoogleProvider());
      const idToken = await credential.user.getIdToken(true);

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
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

      setSessionUser(payload.user);
      setStatus(`Signed in as ${payload.user.email}`);

      const destination = normalizeNextPath(nextPath, payload.user.role);
      router.replace(destination);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Could not complete sign-in.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    setStatus("");
    setIsLoggingOut(true);

    try {
      const auth = getFirebaseClientAuth();
      await signOut(auth);
    } catch {
      // Continue clearing server session even if client SDK sign-out fails.
    }

    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
      });
      setSessionUser(null);
      setStatus("Signed out.");
    } catch {
      setError("Could not clear session.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const firebaseConfigured = isFirebaseClientConfigured();

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <main className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl md:p-8">
        <p className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
          Hub Access
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-4xl">
          Sign in with your school account
        </h1>
        <p className="mt-3 text-sm text-slate-300 md:text-base">
          Admins must be manually assigned by Firebase UID. Students can sign in when their school
          email domain is linked to an admin-managed Hub.
        </p>

        <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-200">
          <p>Admin routes are protected by role checks on both page access and API actions.</p>
          <p className="mt-1">Student access is scoped to your connected university domain.</p>
        </div>

        {!firebaseConfigured ? (
          <p className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            Firebase web config is missing. Add FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN,
            FIREBASE_PROJECT_ID, and FIREBASE_APP_ID.
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {status ? (
          <p className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {status}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
          >
            Home
          </Link>
          <Link
            href="/student/inventory"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
          >
            Student Inventory
          </Link>
          <Link
            href="/admin"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-cyan-300/60"
          >
            Admin Dashboard
          </Link>
        </div>

        <div className="mt-6 space-y-3">
          {isLoadingSession ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/45 p-2">
              <LoadingAnimation
                message="Checking your session..."
                className="py-2"
                iconClassName="h-20 w-20"
                messageClassName="mt-2 text-sm font-medium text-slate-300"
              />
            </div>
          ) : null}

          <button
            type="button"
            disabled={!firebaseConfigured || isLoggingIn || isLoadingSession}
            onClick={() => void handleGoogleLogin()}
            className="inline-flex w-full items-center justify-center rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingSession
              ? "Checking session..."
              : isLoggingIn
                ? "Signing in..."
                : "Continue with Google"}
          </button>

          <button
            type="button"
            disabled={!firebaseConfigured || isLoggingOut || !sessionUser}
            onClick={() => void handleLogout()}
            className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
          <main className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-2xl md:p-8">
            <LoadingAnimation
              message="Loading login..."
              className="py-2"
              iconClassName="h-20 w-20"
              messageClassName="mt-2 text-sm font-medium text-slate-300"
            />
          </main>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
