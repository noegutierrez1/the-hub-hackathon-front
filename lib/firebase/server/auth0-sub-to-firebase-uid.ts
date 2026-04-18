import "server-only";
import { createHash } from "node:crypto";

/**
 * Firebase Auth UIDs must be at most 128 UTF-8 bytes. Auth0 `sub` is almost always
 * shorter; when it is not, we use a stable SHA-256 hex string (64 chars).
 */
export function auth0SubToFirebaseUid(sub: string): string {
  if (Buffer.byteLength(sub, "utf8") <= 128) {
    return sub;
  }
  return createHash("sha256").update(sub, "utf8").digest("hex");
}
