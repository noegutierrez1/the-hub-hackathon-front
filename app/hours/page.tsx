"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import HexPanel from "../components/HexPanel";

const defaultWeeklyHours = [
  { day: "Monday",    hours: "9:00 AM - 5:00 PM" },
  { day: "Tuesday",   hours: "9:00 AM - 5:00 PM" },
  { day: "Wednesday", hours: "9:00 AM - 6:00 PM" },
  { day: "Thursday",  hours: "9:00 AM - 5:00 PM" },
  { day: "Friday",    hours: "9:00 AM - 3:00 PM" },
  { day: "Saturday",  hours: "Closed" },
  { day: "Sunday",    hours: "Closed" },
];

const defaultHubName = "The Hub";
const defaultHubDescription = "Check open hours and avoid peak congestion windows.";
const defaultHubLocation = "Building 12, Room 152";
const hubEmail    = "ottercare@csumb.edu";

const navLink = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--fp-panel-border)", color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 600, textDecoration: "none", background: "var(--fp-input-bg)" } as React.CSSProperties;

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

export default function HoursPage() {
  const [hubInfo, setHubInfo] = useState<{
    hubName: string;
    hubDescription: string;
    hubLocation: string;
    weeklyHours: WeeklyHourEntry[];
  } | null>(null);
  const [error, setError] = useState("");

  const loadHubInfo = useCallback(async () => {
    setError("");

    try {
      const response = await fetch("/api/dataconnect/hub-info", { method: "GET" });
      const { json, text } = await readApiPayload(response);

      const payload = (json || {}) as { hub?: HubInfoPayload | null; error?: string };

      if (!response.ok) {
        const details =
          payload.error ||
          (text.trim().startsWith("<!DOCTYPE")
            ? "Received HTML instead of JSON from hub API."
            : text.slice(0, 160));

        throw new Error(details || `Failed to load HubInfo (${response.status}).`);
      }

      const resolvedName = payload.hub?.name?.trim() || defaultHubName;
      const resolvedDescription = payload.hub?.description?.trim() || defaultHubDescription;
      const resolvedLocation = payload.hub?.location?.trim() || defaultHubLocation;

      let resolvedWeeklyHours = defaultWeeklyHours;
      if (payload.hub?.hoursOfOperation) {
        try {
          const parsedHours = JSON.parse(payload.hub.hoursOfOperation);
          const normalizedHours = normalizeWeeklyHours(parsedHours);
          if (normalizedHours.length) {
            resolvedWeeklyHours = normalizedHours;
          }
        } catch {
          resolvedWeeklyHours = defaultWeeklyHours;
        }
      }

      setHubInfo({
        hubName: resolvedName,
        hubDescription: resolvedDescription,
        hubLocation: resolvedLocation,
        weeklyHours: resolvedWeeklyHours,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load HubInfo right now."
      );

      setHubInfo({
        hubName: defaultHubName,
        hubDescription: defaultHubDescription,
        hubLocation: defaultHubLocation,
        weeklyHours: defaultWeeklyHours,
      });
    }
  }, []);

  useEffect(() => {
    void loadHubInfo();
  }, [loadHubInfo]);

  const currentDay = useMemo(() => new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date()), []);
  const todayHours = useMemo(() => {
    if (!hubInfo) {
      return "Loading...";
    }

    return hubInfo.weeklyHours.find((entry) => entry.day === currentDay)?.hours ?? "Unavailable";
  }, [currentDay, hubInfo]);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--fp-page-bg)", padding: "32px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        <HexPanel contentStyle={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 24px" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>{hubInfo?.hubName ?? ""}</p>
            <h1 style={{ color: "var(--fp-text-primary)", fontSize: "clamp(22px, 5vw, 32px)", fontWeight: 800, margin: "0 0 4px" }}>Hours of Operation</h1>
            <p style={{ color: "var(--fp-text-secondary)", fontSize: 14, margin: 0 }}>{hubInfo?.hubDescription ?? ""}</p>
          </div>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link href="/" style={navLink}>Home</Link>
            <Link href="/admin/hours" style={navLink}>Admin Hours</Link>
          </nav>
        </HexPanel>

        {!hubInfo ? (
          <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "18px 20px" }}>
            <p style={{ margin: 0, color: "var(--fp-text-secondary)", fontSize: 13, fontWeight: 700 }}>
              Loading hours...
            </p>
          </HexPanel>
        ) : null}

        {error ? (
          <HexPanel fill="rgba(180,30,30,0.10)" contentStyle={{ padding: "14px 16px" }}>
            <p style={{ margin: 0, color: "#f87171", fontSize: 13, fontWeight: 600 }}>
              {error}
            </p>
          </HexPanel>
        ) : null}

        {hubInfo ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {/* Location & today */}
            <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Location</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--fp-text-primary)", margin: 0 }}>{hubInfo.hubLocation}</p>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Contact</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--fp-button-accent)", margin: 0 }}>{hubEmail}</p>
              </div>
              <HexPanel fill="var(--fp-surface-accent)" contentStyle={{ padding: "14px 16px" }}>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fp-text-muted)", margin: "0 0 4px" }}>Today</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: "var(--fp-text-primary)", margin: "0 0 2px" }}>{currentDay}</p>
                <p style={{ fontSize: 14, color: "var(--fp-text-secondary)", margin: 0 }}>{todayHours}</p>
              </HexPanel>
            </HexPanel>

            {/* Weekly schedule */}
            <HexPanel fill="var(--fp-surface-secondary)" contentStyle={{ padding: "20px 24px" }}>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fp-text-muted)", margin: "0 0 12px" }}>Weekly Schedule</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hubInfo.weeklyHours.map((entry) => {
                  const isToday = entry.day === currentDay;
                  return (
                    <div key={entry.day} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", borderRadius: 8,
                      background: isToday ? "rgba(61,90,138,0.4)" : "rgba(255,255,255,0.03)",
                      border: isToday ? "1px solid var(--fp-panel-border)" : "1px solid transparent",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: isToday ? 800 : 600, color: isToday ? "var(--fp-text-primary)" : "var(--fp-text-secondary)" }}>{entry.day}</span>
                        {isToday && <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--fp-panel-border)", color: "#fff", padding: "2px 7px", borderRadius: 20 }}>Today</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? "var(--fp-text-primary)" : "var(--fp-text-muted)" }}>{entry.hours}</span>
                    </div>
                  );
                })}
              </div>
            </HexPanel>
          </div>
        ) : null}

      </div>
    </div>
  );
}
