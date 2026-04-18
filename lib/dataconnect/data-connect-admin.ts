import "server-only";
import { getDataConnect } from "firebase-admin/data-connect";

import { getFirebaseAdminApp } from "@/lib/firebase/server/admin";

import {
  getDataConnectConnectorConfig,
  isDataConnectConfigured,
} from "./connector-config";

/**
 * Data Connect Admin client (bypasses `@auth` unless you pass impersonation).
 * Use only on the server.
 */
export function getDataConnectAdmin() {
  if (!isDataConnectConfigured()) {
    throw new Error("Data Connect is not configured.");
  }
  return getDataConnect(getDataConnectConnectorConfig(), getFirebaseAdminApp());
}
