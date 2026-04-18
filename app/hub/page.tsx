import Link from "next/link";

import { HubStaffEditor } from "@/components/hub-staff-editor";
import { auth0 } from "@/lib/auth0";
import { isDataConnectConfigured } from "@/lib/dataconnect/connector-config";
import { listHubInfos } from "@/lib/dataconnect/hub";
import { isStaffRole } from "@/lib/dataconnect/roles";
import { lookupUserRoleForSession } from "@/lib/dataconnect/users";
import { auth0SubToFirebaseUid } from "@/lib/firebase/server/auth0-sub-to-firebase-uid";

export const metadata = {
  title: "The Hub — info",
};

export default async function HubPage() {
  const session = await auth0.getSession();
  const email = session?.user?.email ?? null;
  const firebaseUid = session?.user?.sub
    ? auth0SubToFirebaseUid(session.user.sub)
    : null;

  let hubs: Awaited<ReturnType<typeof listHubInfos>> = [];
  let loadError: string | null = null;
  const configured = isDataConnectConfigured();

  if (configured) {
    try {
      hubs = await listHubInfos();
    } catch (e) {
      console.error("[hub page] listHubInfos", e);
      loadError =
        "Could not load hub info from Data Connect. Check FIREBASE_DATACONNECT_* env vars and that the service account can access the Data Connect API.";
    }
  }

  let role: string | null = null;
  if (configured && firebaseUid) {
    try {
      role = await lookupUserRoleForSession(firebaseUid, email);
    } catch {
      role = null;
    }
  }

  const canEdit = Boolean(
    session && firebaseUid && isStaffRole(role),
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 px-6 py-16 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50 sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">The Hub</h1>
            <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
              Hours, location, and details from Data Connect.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            ← Home
          </Link>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">Data Connect is not configured on the server.</p>
            <p className="mt-2 text-amber-900/90 dark:text-amber-100/90">
              Set{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">
                FIREBASE_DATACONNECT_SERVICE_ID
              </code>{" "}
              and{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">
                FIREBASE_DATACONNECT_LOCATION
              </code>{" "}
              (see <code className="rounded bg-amber-100 px-1">.env</code>). Use
              the same service account as Firebase Admin.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            {loadError}
          </div>
        ) : null}

        {session && firebaseUid && role ? (
          <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
            {email ? (
              <>
                Signed in as{" "}
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  {email}
                </span>
              </>
            ) : (
              <>Signed in (no email on profile)</>
            )}
            {" · "}
            Role: <span className="font-medium">{role}</span>
            {canEdit ? " (can edit hub info)" : " (read-only)"}
          </p>
        ) : null}

        {!session ? (
          <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/auth/login" className="font-medium underline-offset-4 hover:underline">
              Log in
            </Link>{" "}
            to see role and staff edit tools.
          </p>
        ) : null}

        {configured && !loadError && hubs.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No hub rows yet. Add a row in Data Connect for{" "}
            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">HubInfo</code>.
          </p>
        ) : null}

        <ul className="mt-8 flex flex-col gap-6">
          {hubs.map((hub) => (
            <li
              key={hub.id}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-xl font-semibold">{hub.name}</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Hours</dt>
                  <dd>{hub.hoursOfOperation}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Location</dt>
                  <dd>{hub.location ?? "—"}</dd>
                </div>
                {hub.description ? (
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500 dark:text-zinc-400">About</dt>
                    <dd className="whitespace-pre-wrap">{hub.description}</dd>
                  </div>
                ) : null}
              </dl>
              <HubStaffEditor hub={hub} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
