import Link from "next/link";
import HexPanel from "../components/HexPanel";

const adminCards = [
  { title: "AI Inventory Upload", detail: "Upload shelf photos and parse brand/name/count with AI.", href: "/inventory" },
  { title: "Manual Stock Edit", detail: "Correct quantities and categories when needed.", href: "/admin/stock" },
  { title: "Hours Management", detail: "Update open hours and location details for students.", href: "/admin/hours" },
  { title: "Event Management", detail: "Create events and configure queue windows.", href: "/admin/events" },
  { title: "Checkout Scanner", detail: "Take table photos and decrement shelf inventory.", href: "/checkout" },
  { title: "Floor Plan Editor", detail: "Edit zones, walls, markers and generate QR codes for shelves.", href: "/admin/settings/map-editor" },
];

export default function AdminPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "32px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        <HexPanel contentStyle={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 24px" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Admin</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 34px)", fontWeight: 800, margin: 0 }}>Hub Operations Dashboard</h1>
          </div>
          <Link href="/" style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" }}>
            ← Home
          </Link>
        </HexPanel>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {adminCards.map(card => (
            <HexPanel key={card.href} fill="var(--fp-surface-secondary)" style={{ display: "block" }} contentStyle={{ padding: "18px 20px" }}>
              <Link href={card.href} style={{ textDecoration: "none", display: "block" }}>
                <h2 style={{ color: "var(--fp-text-primary)", fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{card.title}</h2>
                <p style={{ color: "var(--fp-text-muted)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>{card.detail}</p>
              </Link>
            </HexPanel>
          ))}
        </div>

      </div>
    </div>
  );
}
