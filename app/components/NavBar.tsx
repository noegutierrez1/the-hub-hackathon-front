"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { getFirebaseClientAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";

type SessionUser = {
  uid: string;
  email: string;
  role: "admin" | "student";
  displayName: string | null;
  photoUrl: string | null;
};

type NavLink = { href: string; label: string };

const GUEST_LINKS: NavLink[] = [
  { href: "/student/inventory", label: "Inventory" },
  { href: "/map", label: "Map" },
  { href: "/hours", label: "Hours" },
  { href: "/events", label: "Events" },
];

const STUDENT_EXTRA_LINKS: NavLink[] = [{ href: "/checkin", label: "Check In" }];

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/inventory", label: "Upload" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/checkout", label: "Checkout" },
  { href: "/admin/hours", label: "Hours" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/settings/map-editor", label: "Floor Plan" },
];

let sessionPromise: Promise<SessionUser | null> | null = null;

function fetchSession(): Promise<SessionUser | null> {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/auth/session", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.user as SessionUser) ?? null)
      .catch(() => null);
  }
  return sessionPromise;
}

function resetSessionCache() {
  sessionPromise = null;
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSession().then(setUser);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    try {
      if (isFirebaseClientConfigured()) {
        await signOut(getFirebaseClientAuth());
      }
    } catch {}
    await fetch("/api/auth/session", { method: "DELETE" });
    resetSessionCache();
    setUser(null);
    router.push("/");
  };

  const navLinks: NavLink[] =
    user?.role === "admin"
      ? ADMIN_LINKS
      : user?.role === "student"
      ? [...GUEST_LINKS, ...STUDENT_EXTRA_LINKS]
      : GUEST_LINKS;

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      <style>{`
        .nav-link-active { color: var(--fp-button-accent) !important; }
        .nav-link:hover { color: var(--fp-text-primary) !important; }
        .hamburger-line { display: block; width: 22px; height: 2px; background: var(--fp-text-secondary); margin: 4px 0; transition: all 0.2s; }
        .profile-avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; border: 2px solid var(--fp-panel-border); cursor: pointer; }
        .avatar-initials { width: 34px; height: 34px; border-radius: 50%; background: var(--fp-button-accent); color: #fff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid var(--fp-panel-border); }
        .dropdown-menu { position: absolute; right: 0; top: calc(100% + 8px); background: var(--fp-surface-primary); border: 1px solid var(--fp-panel-border); border-radius: 10px; min-width: 180px; padding: 6px; z-index: 200; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .dropdown-item { display: block; width: 100%; padding: 9px 12px; border-radius: 7px; background: none; border: none; color: var(--fp-text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; }
        .dropdown-item:hover { background: var(--fp-surface-secondary); color: var(--fp-text-primary); }
        .mobile-drawer { display: none; }
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .mobile-hamburger { display: flex !important; }
          .mobile-drawer { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px 16px; border-top: 1px solid var(--fp-panel-border); }
        }
        @media (min-width: 769px) {
          .mobile-hamburger { display: none !important; }
        }
      `}</style>
      <nav
        style={{
          background: "var(--fp-surface-primary)",
          borderBottom: "1px solid var(--fp-panel-border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 20px",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <Image
              src="/logo.png"
              alt="Open Shelf"
              width={38}
              height={38}
              priority
              style={{ borderRadius: 8 }}
            />
            <span
              style={{
                fontSize: 17,
                fontWeight: 900,
                color: "var(--fp-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Open{" "}
              <span style={{ color: "var(--fp-button-accent)" }}>Shelf</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div
            className="nav-links-desktop"
            style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, paddingLeft: 16 }}
          >
            {navLinks.map((link) => {
              const isActive =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link${isActive ? " nav-link-active" : ""}`}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    color: "var(--fp-text-secondary)",
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right slot */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {user === undefined ? (
              <div style={{ width: 34, height: 34 }} />
            ) : user ? (
              <div ref={dropdownRef} style={{ position: "relative" }}>
                {user.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoUrl}
                    alt={user.displayName ?? user.email}
                    className="profile-avatar"
                    onClick={() => setDropdownOpen((o) => !o)}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="avatar-initials"
                    onClick={() => setDropdownOpen((o) => !o)}
                    title={user.displayName ?? user.email}
                  >
                    {initials}
                  </div>
                )}
                {dropdownOpen && (
                  <div className="dropdown-menu">
                    <div
                      style={{
                        padding: "8px 12px 8px",
                        borderBottom: "1px solid var(--fp-panel-border)",
                        marginBottom: 4,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--fp-text-primary)",
                        }}
                      >
                        {user.displayName ?? "User"}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 11,
                          color: "var(--fp-text-muted)",
                        }}
                      >
                        {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={() => void handleLogout()}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: "var(--fp-button-accent)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Get Started
              </Link>
            )}

            {/* Hamburger */}
            <button
              type="button"
              className="mobile-hamburger"
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "none",
                flexDirection: "column",
                justifyContent: "center",
              }}
              aria-label="Toggle menu"
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="mobile-drawer">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`nav-link${isActive ? " nav-link-active" : ""}`}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    color: "var(--fp-text-secondary)",
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </>
  );
}
