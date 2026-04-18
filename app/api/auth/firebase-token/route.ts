import { NextResponse } from "next/server";

import { auth0 } from "@/lib/auth0";
import { isDataConnectConfigured } from "@/lib/dataconnect/connector-config";
import {
  ensureUserProfileForAuth,
  lookupUserRoleForSession,
} from "@/lib/dataconnect/users";
import { getFirebaseAdminAuth } from "@/lib/firebase/server/admin";
import { auth0SubToFirebaseUid } from "@/lib/firebase/server/auth0-sub-to-firebase-uid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a Firebase custom token for the currently logged-in Auth0 user.
 * The client should call `signInWithCustomToken` with this value.
 */
export async function POST() {
  const session = await auth0.getSession();
  if (!session?.user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = auth0SubToFirebaseUid(session.user.sub);
  const claims: Record<string, string> = { auth0_sub: session.user.sub };
  if (session.user.email) {
    claims.email = session.user.email;
  }

  if (isDataConnectConfigured()) {
    try {
      await ensureUserProfileForAuth({
        firebaseUid: uid,
        email: session.user.email,
        name: session.user.name,
      });
      const role = await lookupUserRoleForSession(uid, session.user.email);
      if (role) {
        claims.role = role;
      }
    } catch (e) {
      console.warn("[firebase-token] Data Connect user/role failed", e);
    }
  }

  try {
    const customToken = await getFirebaseAdminAuth().createCustomToken(
      uid,
      claims,
    );
    return NextResponse.json({ customToken, firebaseUid: uid });
  } catch (err) {
    console.error("[firebase-token]", err);
    return NextResponse.json(
      { error: "Failed to mint Firebase custom token" },
      { status: 500 },
    );
  }
}
