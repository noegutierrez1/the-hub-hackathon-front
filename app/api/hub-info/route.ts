import { NextResponse } from "next/server";

import { auth0 } from "@/lib/auth0";
import { isDataConnectConfigured } from "@/lib/dataconnect/connector-config";
import { adminUpdateHubInfo } from "@/lib/dataconnect/hub";
import { userIsStaffForSession } from "@/lib/dataconnect/users";
import { auth0SubToFirebaseUid } from "@/lib/firebase/server/auth0-sub-to-firebase-uid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id: string;
  name: string;
  hoursOfOperation: string;
  description?: string | null;
  location?: string | null;
};

/**
 * Staff-only hub updates. Authorization: Auth0 session + `User.role` in Data Connect (staff/admin/…).
 * The GraphQL update itself runs with Admin privileges after this check (step-4 style gate in the app layer).
 */
export async function POST(request: Request) {
  if (!isDataConnectConfigured()) {
    return NextResponse.json(
      { error: "Data Connect is not configured on the server." },
      { status: 503 },
    );
  }

  const session = await auth0.getSession();
  if (!session?.user?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const firebaseUid = auth0SubToFirebaseUid(session.user.sub);
  const email = session.user.email;
  const staff = await userIsStaffForSession(firebaseUid, email);
  if (!staff) {
    return NextResponse.json(
      { error: "Forbidden: staff role required to edit hub info." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, name, hoursOfOperation, description, location } = body;
  if (!id || !name || hoursOfOperation === undefined || hoursOfOperation === "") {
    return NextResponse.json(
      { error: "Missing required fields: id, name, hoursOfOperation" },
      { status: 400 },
    );
  }

  try {
    await adminUpdateHubInfo({
      id,
      name,
      hoursOfOperation,
      description,
      location,
    });
  } catch (e) {
    console.error("[hub-info POST]", e);
    return NextResponse.json(
      { error: "Data Connect update failed (check schema and field names)." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
