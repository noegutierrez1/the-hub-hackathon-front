"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import HexPanel from "../../components/HexPanel";

const defaultWeeklyHours = [
  { day: "Monday", hours: "9:00 AM - 5:00 PM" },
  { day: "Tuesday", hours: "9:00 AM - 5:00 PM" },
  { day: "Wednesday", hours: "9:00 AM - 6:00 PM" },
  { day: "Thursday", hours: "9:00 AM - 5:00 PM" },
  { day: "Friday", hours: "9:00 AM - 3:00 PM" },
  { day: "Saturday", hours: "Closed" },
  { day: "Sunday", hours: "Closed" },
];

type WeeklyHourEntry = {
  day: string;
  hours: string;
};

type HubInfoPayload = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  hoursOfOperation: string;
};

async function readApiPayload(response: Response): Promise<{
  json: Record<string, unknown> | null;
  text: string;
}> {
  const rawText = await response.text();

  if (!rawText) {
    return { json: null, text: "" };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return { json: parsed, text: rawText };
  } catch {
    return { json: null, text: rawText };
  }
}

function normalizeWeeklyHours(value: unknown): WeeklyHourEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      const day = typeof row.day === "string" ? row.day.trim() : "";
      const hours = typeof row.hours === "string" ? row.hours.trim() : "";

      if (!day || !hours) {
        return null;
      }

      return { day, hours };
    })
    .filter((entry): entry is WeeklyHourEntry => entry !== null);
}

export default function AdminHoursPage() {
  const [hubName, setHubName] = useState("The Hub");
  const [location, setLocation] = useState("Student Union Basement, Room B18");
  const [description, setDescription] = useState(
    "Students can check open hours and avoid peak congestion windows."
  );
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHourEntry[]>(defaultWeeklyHours);
  const [hubInfoId, setHubInfoId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const serializedHours = useMemo(() => {
    return JSON.stringify(weeklyHours, null, 2);
  }, [weeklyHours]);

  function updateHours(day: string, nextValue: string) {
    setWeeklyHours((current) =>
      current.map((entry) =>
        entry.day === day ? { ...entry, hours: nextValue } : entry
      )
    );
  }

  const loadHubInfo = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/dataconnect/hub-info", {
        method: "GET",
      });

      const { json, text } = await readApiPayload(response);
      const payload = (json || {}) as {
        hub?: HubInfoPayload | null;
        error?: string;
      };

      if (!response.ok) {
        const details =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON from hub API."
            : text.slice(0, 160));

        throw new Error(details || `Failed to load HubInfo (${response.status}).`);
      }

      if (!payload.hub) {
        setHubInfoId(null);
        setWeeklyHours(defaultWeeklyHours);
        return;
      }

      setHubInfoId(payload.hub.id);
      setHubName(payload.hub.name);
      setLocation(payload.hub.location || "");
      setDescription(payload.hub.description || "");

      try {
        const parsedHours = JSON.parse(payload.hub.hoursOfOperation);
        const normalizedHours = normalizeWeeklyHours(parsedHours);

        if (normalizedHours.length) {
          setWeeklyHours(normalizedHours);
        } else {
          setWeeklyHours(defaultWeeklyHours);
        }
      } catch {
        setWeeklyHours(defaultWeeklyHours);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load HubInfo right now."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHubInfo();
  }, [loadHubInfo]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const response = await fetch("/api/dataconnect/hub-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: hubInfoId,
          name: hubName,
          location,
          description,
          hoursOfOperation: weeklyHours,
        }),
      });

      const { json, text } = await readApiPayload(response);
      const payload = (json || {}) as {
        success?: boolean;
        mode?: "insert" | "update";
        id?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        const details =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON from hub API."
            : text.slice(0, 160));

        throw new Error(details || `Failed to save HubInfo (${response.status}).`);
      }

      if (payload.id) {
        setHubInfoId(payload.id);
      }

      setSaveMessage(
        payload.mode === "insert"
          ? "Hub information created successfully."
          : "Hub information updated successfully."
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save HubInfo right now."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const navLink = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" } as React.CSSProperties;

  const inputStyle: React.CSSProperties = {
    background: "var(--fp-input-bg)",
    border: "1px solid var(--fp-panel-border)",
    color: "var(--fp-text-primary)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const sectionStyle: React.CSSProperties = {
    background: "var(--fp-input-bg)",
    border: "1px solid var(--fp-panel-border)",
    borderRadius: 14,
    padding: 18,
  };

  const labelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "var(--fp-text-secondary)",
    fontSize: 13,
    fontWeight: 600,
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "clamp(12px, 4vw, 32px) clamp(10px, 3vw, 24px)", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <HexPanel contentStyle={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Admin Settings</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, margin: "0 0 4px" }}>Manage Hub Hours</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>Configure the Hub details that appear on the student-facing hours page.</p>
          </div>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin" style={navLink}>Admin Dashboard</Link>
            <Link href="/hours" style={navLink}>Student Hours</Link>
          </nav>
        </HexPanel>

        <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px" }}>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Hub information */}
            <section style={sectionStyle}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: 0 }}>Hub information</p>
                <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: 0 }}>
                  {isLoading ? "Loading current settings…" : hubInfoId ? "Editing existing HubInfo" : "Creating first HubInfo record"}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label style={labelStyle}>
                  Hub name
                  <input type="text" value={hubName} onChange={(e) => setHubName(e.target.value)} style={inputStyle} />
                </label>

                <label style={labelStyle}>
                  Location
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
                </label>

                <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
              </div>
            </section>

            {/* Weekly hours */}
            <section style={sectionStyle}>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Weekly hours</p>
                <p style={{ color: "var(--fp-text-muted)", fontSize: 12, margin: 0 }}>Enter the display text for each day exactly as it should appear.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {weeklyHours.map((entry) => (
                  <div
                    key={entry.day}
                    className="grid gap-3 md:grid-cols-[160px_1fr]"
                    style={{ background: "var(--fp-surface-secondary)", border: "1px solid var(--fp-panel-border)", borderRadius: 10, padding: "10px 14px", alignItems: "center" }}
                  >
                    <p style={{ color: "var(--fp-text-primary)", fontWeight: 700, fontSize: 13, margin: 0 }}>{entry.day}</p>
                    <input
                      type="text"
                      value={entry.hours}
                      onChange={(e) => updateHours(entry.day, e.target.value)}
                      placeholder="9:00 AM – 5:00 PM or Closed"
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </section>

            {error ? (
              <p style={{ border: "1px solid #7f2020", background: "rgba(180,30,30,0.12)", color: "#f87171", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: 0 }}>
                {error}
              </p>
            ) : null}

            {saveMessage ? (
              <p style={{ border: "1px solid #2d6a4a", background: "rgba(30,160,90,0.10)", color: "#6ee7b7", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: 0 }}>
                {saveMessage}
              </p>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="submit"
                disabled={isSaving}
                style={{ background: "var(--fp-button-accent)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, padding: "10px 20px", cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.6 : 1 }}
              >
                {isSaving ? "Saving…" : "Save Hub Hours"}
              </button>

              <button
                type="button"
                onClick={() => { setWeeklyHours(defaultWeeklyHours); setSaveMessage(""); setError(""); }}
                style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 9, fontWeight: 600, fontSize: 13, padding: "10px 18px", cursor: "pointer" }}
              >
                Reset to defaults
              </button>

              <button
                type="button"
                onClick={() => void loadHubInfo()}
                style={{ border: "1px solid var(--fp-panel-border)", background: "var(--fp-input-bg)", color: "var(--fp-text-secondary)", borderRadius: 9, fontWeight: 600, fontSize: 13, padding: "10px 18px", cursor: "pointer" }}
              >
                Reload saved values
              </button>
            </div>
          </form>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
            <Link href="/admin" style={navLink}>Admin Dashboard</Link>
            <Link href="/hours" style={navLink}>Student Hours Page</Link>
          </div>
        </HexPanel>
      </div>
    </div>
  );
}