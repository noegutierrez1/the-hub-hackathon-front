import Link from "next/link";
import HexPanel from "./components/HexPanel";

const publicLinks = [
  { href: "/student/inventory", label: "Browse Inventory" },
  { href: "/map", label: "Floor Map" },
  { href: "/hours", label: "Hours" },
  { href: "/events", label: "Events" },
];

const navLinkStyle = {
  display: "block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--fp-panel-border)",
  color: "var(--fp-text-secondary)",
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  background: "var(--fp-input-bg)",
  transition: "border-color 0.15s",
} as React.CSSProperties;

export default function Home() {
  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        background: "var(--fp-page-bg)",
        padding: "40px 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Hero */}
        <HexPanel contentStyle={{ padding: "36px 32px" }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--fp-button-accent)",
              margin: "0 0 10px",
            }}
          >
            CSUMB — The Hub
          </p>
          <h1
            style={{
              color: "var(--fp-text-primary)",
              fontSize: "clamp(28px, 6vw, 46px)",
              fontWeight: 900,
              margin: "0 0 14px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Open{" "}
            <span style={{ color: "var(--fp-button-accent)" }}>Shelf</span>
          </h1>
          <p
            style={{
              color: "var(--fp-text-secondary)",
              fontSize: 16,
              margin: "0 0 28px",
              maxWidth: 520,
              lineHeight: 1.65,
            }}
          >
            See what&apos;s available at The Hub before you arrive. Browse live
            inventory, check the floor map, and find out when we&apos;re open.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link
              href="/student/inventory"
              style={{
                ...navLinkStyle,
                background: "var(--fp-button-accent)",
                color: "#fff",
                border: "none",
              }}
            >
              Browse Inventory
            </Link>
            <Link href="/map" style={navLinkStyle}>
              View Floor Map
            </Link>
          </div>
        </HexPanel>

        {/* Quick links */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          {publicLinks.map((link) => (
            <HexPanel
              key={link.href}
              fill="var(--fp-surface-secondary)"
              contentStyle={{ padding: "16px 18px" }}
            >
              <Link
                href={link.href}
                style={{ textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center" }}
              >
                <span
                  style={{
                    color: "var(--fp-text-primary)",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {link.label}
                </span>
              </Link>
            </HexPanel>
          ))}
        </div>

        {/* What this solves */}
        <HexPanel
          fill="var(--fp-surface-accent)"
          contentStyle={{ padding: "20px 24px" }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--fp-text-muted)",
              margin: "0 0 14px",
            }}
          >
            How It Helps
          </p>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {[
              "Know what's available before walking to The Hub.",
              "Find items on the floor map so you grab what you need fast.",
              "Check current hours and upcoming events.",
              "Students can claim items directly from their phone.",
            ].map((item) => (
              <li
                key={item}
                style={{
                  color: "var(--fp-text-secondary)",
                  fontSize: 14,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: "var(--fp-button-accent)",
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
                {item}
              </li>
            ))}
          </ul>
        </HexPanel>
      </div>
    </div>
  );
}
