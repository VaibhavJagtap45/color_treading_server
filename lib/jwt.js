import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!process.env.JWT_SECRET) {
  console.warn("⚠  JWT_SECRET is not set — using an insecure dev default. Set it in production.");
}

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id || user._id), username: user.username, role: user.role },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  // Throws on invalid / expired tokens.
  return jwt.verify(token, SECRET);
}
