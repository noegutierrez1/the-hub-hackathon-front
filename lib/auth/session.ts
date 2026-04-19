import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { normalizeEmailDomain } from "@/lib/auth/hub-domain";

export const HUB_SESSION_COOKIE_NAME = "hub_session";

const SESSION_ISSUER = "hub-inventory";
const SESSION_AUDIENCE = "hub-inventory-users";
const SESSION_ALGORITHM = "HS256";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type HubSessionRole = "admin" | "student";

export type HubSession = {
  uid: string;
  email: string;
  role: HubSessionRole;
  hubDomain: string;
  displayName: string | null;
  photoUrl: string | null;
  iat: number;
  exp: number;
};

type HubSessionTokenPayload = JWTPayload & {
  uid: string;
  email: string;
  role: HubSessionRole;
  hubDomain: string;
  displayName?: string | null;
  photoUrl?: string | null;
};

type CreateHubSessionInput = {
  uid: string;
  email: string;
  role: HubSessionRole;
  hubDomain: string;
  displayName?: string | null;
  photoUrl?: string | null;
};

function readSessionSecret() {
  const secret =
    process.env.AUTH_SESSION_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "";

  if (!secret) {
    throw new Error(
      "Missing AUTH_SESSION_SECRET (or SESSION_SECRET). Set a long random value for signed sessions."
    );
  }

  return secret;
}

function getEncodedSessionSecret() {
  return new TextEncoder().encode(readSessionSecret());
}

export function getSessionMaxAgeSeconds() {
  const raw = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }

  return Math.floor(raw);
}

function normalizeRole(value: unknown): HubSessionRole | null {
  if (value === "admin" || value === "student") {
    return value;
  }

  return null;
}

function normalizeHubSessionPayload(payload: JWTPayload) {
  const record = payload as Partial<HubSessionTokenPayload>;

  const uid = typeof record.uid === "string" ? record.uid.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const role = normalizeRole(record.role);
  const hubDomain = normalizeEmailDomain(record.hubDomain);

  if (!uid || !email || !role || !hubDomain) {
    return null;
  }

  const issuedAt = typeof record.iat === "number" ? record.iat : null;
  const expiresAt = typeof record.exp === "number" ? record.exp : null;
  if (!issuedAt || !expiresAt) {
    return null;
  }

  return {
    uid,
    email,
    role,
    hubDomain,
    displayName: typeof record.displayName === "string" ? record.displayName.trim() || null : null,
    photoUrl: typeof record.photoUrl === "string" ? record.photoUrl.trim() || null : null,
    iat: issuedAt,
    exp: expiresAt,
  } as HubSession;
}

export async function createHubSessionToken(input: CreateHubSessionInput) {
  const hubDomain = normalizeEmailDomain(input.hubDomain);
  const email = input.email.trim().toLowerCase();
  const uid = input.uid.trim();

  if (!hubDomain || !email || !uid) {
    throw new Error("Session token payload is missing required user fields.");
  }

  const displayName = input.displayName?.trim() || null;
  const photoUrl = input.photoUrl?.trim() || null;
  const maxAgeSeconds = getSessionMaxAgeSeconds();

  return new SignJWT({
    uid,
    email,
    role: input.role,
    hubDomain,
    displayName,
    photoUrl,
  })
    .setProtectedHeader({ alg: SESSION_ALGORITHM })
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getEncodedSessionSecret());
}

export async function verifyHubSessionToken(token: string | null | undefined) {
  const compactToken = token?.trim();
  if (!compactToken) {
    return null;
  }

  try {
    const verified = await jwtVerify(compactToken, getEncodedSessionSecret(), {
      algorithms: [SESSION_ALGORITHM],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    return normalizeHubSessionPayload(verified.payload);
  } catch {
    return null;
  }
}
