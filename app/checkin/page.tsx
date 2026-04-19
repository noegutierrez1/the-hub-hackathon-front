import HexPanel from "../components/HexPanel";
import AuthGate from "../components/AuthGate";

const events = [
  { name: "Fresh Produce Pop-Up", start: "Tuesday 1:00 PM", end: "Tuesday 3:00 PM", seats: "30" },
  { name: "Protein Pantry Refill", start: "Thursday 11:30 AM", end: "Thursday 1:30 PM", seats: "40" },
  { name: "Weekend Grab-and-Go", start: "Friday 4:00 PM", end: "Friday 6:00 PM", seats: "50" },
];

export default function CheckinPage() {
  return (
    <AuthGate>
    <div style={{ minHeight: "calc(100dvh - 56px)", background: "var(--fp-page-bg)", padding: "32px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        <HexPanel contentStyle={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Student Queue</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, margin: "0 0 4px" }}>Peak-Hour Check-In</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>Join a queue for major Hub events so line management stays predictable.</p>
          </div>
        </HexPanel>

        {/* Step 1 — Select timeslot */}
        <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px" }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 14px" }}>1 — Select a timeslot</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map(event => (
              <div key={event.name} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--fp-input-border)", background: "var(--fp-input-bg)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ color: "var(--fp-text-primary)", fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>{event.name}</p>
                  <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: 0 }}>{event.start} – {event.end}</p>
                </div>
                <span style={{ color: "var(--fp-button-accent)", fontSize: 12, fontWeight: 700 }}>{event.seats} seats</span>
              </div>
            ))}
          </div>
        </HexPanel>

        {/* Step 2 — Student ID */}
        <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px" }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 14px" }}>2 — Confirm student ID</p>
          <input
            type="text"
            placeholder="Enter your student ID…"
            disabled
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--fp-input-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-muted)", fontSize: 15, cursor: "not-allowed" }}
          />
        </HexPanel>

        {/* Coming soon */}
        <HexPanel fill="var(--fp-surface-accent)" contentStyle={{ padding: "18px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--fp-button-accent)", margin: "0 0 4px" }}>Queue system coming soon</p>
          <p style={{ fontSize: 13, color: "var(--fp-text-muted)", margin: 0 }}>Step 3 — Receive your queue position and estimated wait time once this feature is live.</p>
        </HexPanel>

      </div>
    </div>
    </AuthGate>
  );
}
