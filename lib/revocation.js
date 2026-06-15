import { RevokedToken } from "../models/RevokedToken.js";

/**
 * Revoke a token by its jti so it can no longer authenticate (server-side
 * logout). Idempotent — re-revoking the same token is a no-op. `payload` is the
 * verified JWT claims; we need its `jti` and `exp`.
 */
export async function revokeToken(payload) {
  if (!payload?.jti || !payload?.exp) return;
  await RevokedToken.updateOne(
    { jti: payload.jti },
    { $setOnInsert: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) } },
    { upsert: true }
  );
}

/** True if a token with this jti has been revoked. */
export async function isTokenRevoked(jti) {
  if (!jti) return false;
  return Boolean(await RevokedToken.exists({ jti }));
}
