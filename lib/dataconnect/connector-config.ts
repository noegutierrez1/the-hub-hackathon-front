import type { ConnectorConfig } from "firebase-admin/data-connect";

/**
 * Minimal config for {@link executeGraphql} / {@link executeGraphqlRead} (service endpoint).
 * Named connector operations need `connector` set — see env comments.
 */
export function getDataConnectConnectorConfig(): ConnectorConfig {
  const location =
    process.env.FIREBASE_DATACONNECT_LOCATION?.trim() || "us-central1";
  const serviceId = process.env.FIREBASE_DATACONNECT_SERVICE_ID?.trim();
  if (!serviceId) {
    throw new Error(
      "Missing FIREBASE_DATACONNECT_SERVICE_ID (Firebase Console → Data Connect → service id).",
    );
  }
  const connector = process.env.FIREBASE_DATACONNECT_CONNECTOR?.trim();
  return {
    location,
    serviceId,
    ...(connector ? { connector } : {}),
  };
}

export function isDataConnectConfigured(): boolean {
  return Boolean(process.env.FIREBASE_DATACONNECT_SERVICE_ID?.trim());
}
