import { NextResponse } from "next/server";

import { isDataConnectConfigured } from "@/lib/dataconnect/connector-config";
import { listHubInfos } from "@/lib/dataconnect/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 4: privileged **Admin SDK** surface — only trusted callers with `DATACONNECT_ADMIN_SECRET`.
 * Add more `operation` branches that run `@auth(level: NO_ACCESS)` mutations via Admin `executeGraphql`.
 */
export async function POST(request: Request) {
  const secret = process.env.DATACONNECT_ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "DATACONNECT_ADMIN_SECRET is not set (define a long random string in production).",
      },
      { status: 503 },
    );
  }

  const authz = request.headers.get("authorization");
  if (authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDataConnectConfigured()) {
    return NextResponse.json(
      { error: "Data Connect is not configured." },
      { status: 503 },
    );
  }

  let body: { operation?: string } = {};
  try {
    body = (await request.json()) as { operation?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.operation === "health") {
    try {
      const hubs = await listHubInfos();
      return NextResponse.json({
        ok: true,
        hubCount: hubs.length,
        message: "Admin Data Connect path is working.",
      });
    } catch (e) {
      console.error("[admin/data-connect health]", e);
      return NextResponse.json(
        { error: "Health check failed against Data Connect." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    {
      error:
        'Unknown operation. Use POST JSON { "operation": "health" } with Authorization: Bearer <DATACONNECT_ADMIN_SECRET>.',
    },
    { status: 400 },
  );
}
