import "server-only";

import type { ExecuteGraphqlResponse } from "firebase-admin/data-connect";

import { getDataConnectAdmin } from "./data-connect-admin";
import { isDataConnectConfigured } from "./connector-config";
import { isStaffRole } from "./roles";

const USER_BY_FIREBASE_UID_GQL = `
  query UserByFirebaseUid($uid: String!) {
    users(where: { firebaseUid: { eq: $uid } }, limit: 1) {
      id
      role
      email
      firebaseUid
    }
  }
`;

const USER_BY_EMAIL_GQL = `
  query UserByEmail($email: String!) {
    users(where: { email: { eq: $email } }, limit: 1) {
      id
      role
      email
      firebaseUid
    }
  }
`;

const LINK_FIREBASE_UID_GQL = `
  mutation LinkUserFirebaseUid($id: UUID!, $firebaseUid: String!) {
    user_update(
      first: { where: { id: { eq: $id } } }
      data: { firebaseUid: $firebaseUid }
    )
  }
`;

const INSERT_USER_GQL = `
  mutation InsertUserForAuth(
    $firebaseUid: String!
    $email: String
    $username: String!
    $role: String!
  ) {
    user_insert(
      data: {
        firebaseUid: $firebaseUid
        email: $email
        username: $username
        role: $role
      }
    )
  }
`;

type UserRow = {
  id: string;
  role: string;
  email?: string | null;
  firebaseUid?: string | null;
};

type UsersQueryData = { users: UserRow[] };

function pickUsername(params: {
  email?: string | null;
  name?: string | null;
  firebaseUid: string;
}): string {
  const fromEmail = params.email?.split("@")[0]?.trim();
  if (fromEmail && fromEmail.length > 0) {
    return fromEmail.slice(0, 64);
  }
  const fromName = params.name?.trim();
  if (fromName && fromName.length > 0) {
    return fromName.slice(0, 64);
  }
  return `user_${params.firebaseUid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`;
}

/**
 * Canonical role lookup: Firebase Auth `uid` first (linked `User.firebaseUid`), then email for legacy rows.
 */
export async function lookupUserRoleByFirebaseUid(
  firebaseUid: string,
): Promise<string | null> {
  if (!isDataConnectConfigured()) return null;
  const dc = getDataConnectAdmin();
  const res: ExecuteGraphqlResponse<UsersQueryData> =
    await dc.executeGraphqlRead(USER_BY_FIREBASE_UID_GQL, {
      variables: { uid: firebaseUid },
      operationName: "UserByFirebaseUid",
    });
  return res.data?.users?.[0]?.role ?? null;
}

/** Legacy / fallback when `firebaseUid` is not set on the row yet. */
export async function lookupUserRoleByEmail(
  email: string,
): Promise<string | null> {
  if (!isDataConnectConfigured()) return null;
  const dc = getDataConnectAdmin();
  const res: ExecuteGraphqlResponse<UsersQueryData> =
    await dc.executeGraphqlRead(USER_BY_EMAIL_GQL, {
      variables: { email },
      operationName: "UserByEmail",
    });
  return res.data?.users?.[0]?.role ?? null;
}

export async function lookupUserRoleForSession(
  firebaseUid: string,
  email: string | null | undefined,
): Promise<string | null> {
  const byUid = await lookupUserRoleByFirebaseUid(firebaseUid);
  if (byUid) return byUid;
  if (email) return lookupUserRoleByEmail(email);
  return null;
}

export async function userIsStaffForSession(
  firebaseUid: string,
  email: string | null | undefined,
): Promise<boolean> {
  const role = await lookupUserRoleForSession(firebaseUid, email);
  return isStaffRole(role);
}

/**
 * Ensures a `User` row exists and is keyed by `firebaseUid` (upsert semantics via link-or-insert).
 * Does not downgrade an existing `role`; new rows default to `student`.
 */
export async function ensureUserProfileForAuth(params: {
  firebaseUid: string;
  email?: string | null;
  name?: string | null;
}): Promise<void> {
  if (!isDataConnectConfigured()) return;

  const { firebaseUid, email, name } = params;
  const dc = getDataConnectAdmin();

  const existingByUid: ExecuteGraphqlResponse<UsersQueryData> =
    await dc.executeGraphqlRead(USER_BY_FIREBASE_UID_GQL, {
      variables: { uid: firebaseUid },
      operationName: "UserByFirebaseUid",
    });
  if (existingByUid.data?.users?.[0]) {
    return;
  }

  if (email) {
    const byEmailRes: ExecuteGraphqlResponse<UsersQueryData> =
      await dc.executeGraphqlRead(USER_BY_EMAIL_GQL, {
        variables: { email },
        operationName: "UserByEmail",
      });
    const legacy = byEmailRes.data?.users?.[0];
    if (legacy) {
      const existingUid = legacy.firebaseUid?.trim();
      if (!existingUid) {
        await dc.executeGraphql(LINK_FIREBASE_UID_GQL, {
          operationName: "LinkUserFirebaseUid",
          variables: { id: legacy.id, firebaseUid },
        });
        return;
      }
      if (existingUid !== firebaseUid) {
        console.warn(
          "[ensureUserProfileForAuth] User.email matches a row whose firebaseUid differs; skipping link.",
          { email },
        );
      }
      return;
    }
  }

  const username = pickUsername({ email, name, firebaseUid });

  try {
    await dc.executeGraphql(INSERT_USER_GQL, {
      operationName: "InsertUserForAuth",
      variables: {
        firebaseUid,
        email: email ?? null,
        username,
        role: "student",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|unique|conflict/i.test(msg)) {
      console.warn(
        "[ensureUserProfileForAuth] insert skipped (likely concurrent create):",
        msg,
      );
      return;
    }
    throw e;
  }
}
