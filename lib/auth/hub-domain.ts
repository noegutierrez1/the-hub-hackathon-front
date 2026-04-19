const HUB_MARKER_PATTERN = /\[\[HUB:([a-z0-9.-]+)\]\]/i;

export const HUB_MARKER_PREFIX = "[[HUB:";

export function normalizeEmailDomain(value: string | null | undefined) {
  const raw = (value || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const withoutLeadingAt = raw.startsWith("@") ? raw.slice(1) : raw;
  const domainCandidate = withoutLeadingAt.includes("@")
    ? withoutLeadingAt.split("@").at(-1) || ""
    : withoutLeadingAt;
  const clean = domainCandidate.replace(/[^a-z0-9.-]/g, "").replace(/^\.+|\.+$/g, "");

  if (!clean) {
    return null;
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/.test(clean)) {
    return null;
  }

  return clean;
}

export function extractEmailDomain(email: string | null | undefined) {
  return normalizeEmailDomain(email || null);
}

export function extractHubDomainMarker(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(HUB_MARKER_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  return normalizeEmailDomain(match[1]);
}

export function stripHubDomainMarker(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const withoutMarker = value.replace(/\s*\[\[HUB:[^\]]+\]\]\s*/gi, " ").trim();
  return withoutMarker || null;
}

export function withHubDomainMarker(
  value: string | null | undefined,
  hubDomain: string | null | undefined
) {
  const normalizedDomain = normalizeEmailDomain(hubDomain);
  if (!normalizedDomain) {
    return stripHubDomainMarker(value);
  }

  const base = stripHubDomainMarker(value);
  if (!base) {
    return `[[HUB:${normalizedDomain}]]`;
  }

  return `${base}\n[[HUB:${normalizedDomain}]]`;
}

export function isHubVisibleToDomain(
  markerDomain: string | null | undefined,
  sessionDomain: string | null | undefined
) {
  const marker = normalizeEmailDomain(markerDomain);
  if (!marker) {
    // Legacy rows without a marker remain visible until fully migrated.
    return true;
  }

  const session = normalizeEmailDomain(sessionDomain);
  // gmail.com users are not tied to a specific hub — they see all content
  if (session === "gmail.com") return true;
  return Boolean(session && marker === session);
}
