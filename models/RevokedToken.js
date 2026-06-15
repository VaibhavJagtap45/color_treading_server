import mongoose from "mongoose";

/**
 * A deny-list of revoked JWT ids (jti). A token is rejected if its jti is here.
 * `expiresAt` is the token's own expiry: once that passes the token is invalid
 * anyway, so a TTL index lets MongoDB auto-purge the entry (no manual cleanup).
 */
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// TTL index: remove each entry as soon as its expiresAt is in the past.
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = mongoose.model("RevokedToken", revokedTokenSchema);
