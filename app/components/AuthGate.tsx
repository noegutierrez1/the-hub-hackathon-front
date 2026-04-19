"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingAnimation from "@/components/LoadingAnimation";

type SessionUser = {
  uid: string;
  email: string;
  role: "admin" | "student";
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/session", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser((data?.user as SessionUser) ?? null))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div
        style={{
          minHeight: "60dvh",
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

  if (!user) {
    return (
      <div
        style={{
          minHeight: "60dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "40px 24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: "var(--fp-text-primary)",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Open <span style={{ color: "var(--fp-button-accent)" }}>Shelf</span>
        </p>
        <p style={{ color: "var(--fp-text-secondary)", fontSize: 15, margin: 0, maxWidth: 360 }}>
          Sign in to access this page.
        </p>
        <Link
          href="/login"
          style={{
            padding: "12px 28px",
            borderRadius: 10,
            background: "var(--fp-button-accent)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Get Started
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
