import { cookies } from "next/headers";

import { resolveIdentityForLogin } from "@/lib/auth/identity";
import { verifyFirebaseIdToken } from "@/lib/auth/firebase-admin";
import {
  createHubSessionToken,
  getSessionMaxAgeSeconds,
  HUB_SESSION_COOKIE_NAME,
  verifyHubSessionToken,
} from "@/lib/auth/session";

type CreateSessionBody = {
  idToken?: string;
  photoUrl?: string;
};

function toPublicSession(session: {
  uid: string;
  email: string;
  role: "admin" | "student";
  hubDomain: string;
  displayName: string | null;
  photoUrl?: string | null;
}) {
  return {
    uid: session.uid,
    email: session.email,
    role: session.role,
    hubDomain: session.hubDomain,
    displayName: session.displayName,
    photoUrl: session.photoUrl ?? null,
  };
}

function getRoleDefaultPath(role: "admin" | "student") {
  return role === "admin" ? "/admin" : "/student/inventory";
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(HUB_SESSION_COOKIE_NAME)?.value || null;
  const session = await verifyHubSessionToken(token);

  if (!session) {
    return Response.json({ error: "No active session." }, { status: 401 });
  }

  return Response.json({
    user: toPublicSession(session),
    redirectTo: getRoleDefaultPath(session.role),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSessionBody;
    const idToken = body.idToken?.trim() || "";
    const photoUrl = body.photoUrl?.trim() || null;

    if (!idToken) {
      return Response.json({ error: "Missing idToken." }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(idToken);
    } catch {
      return Response.json({ error: "Invalid or expired Firebase login token." }, { status: 401 });
    }

    const identityResult = await resolveIdentityForLogin({
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      displayName: decodedToken.name || null,
    });

    if (!identityResult.ok) {
      return Response.json({ error: identityResult.error }, { status: identityResult.status });
    }

    const sessionToken = await createHubSessionToken({ ...identityResult.identity, photoUrl });
    const cookieStore = await cookies();
    cookieStore.set(HUB_SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });

    return Response.json({
      user: toPublicSession({ ...identityResult.identity, photoUrl }),
      redirectTo: getRoleDefaultPath(identityResult.identity.role),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not create an authenticated session.";

    return Response.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Could not create an authenticated session."
            : message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();

  cookieStore.set(HUB_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return Response.json({ ok: true });
}
