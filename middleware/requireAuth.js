import { User } from "../models/User.js";

/**
 * Express middleware: identify the user from the Bearer "token".
 *
 * JWT auth has been removed. The token is simply the user's id, issued at login.
 * We look the user up and attach req.user; any existing user id is accepted.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const user = await User.findById(token);
    if (!user) return res.status(401).json({ error: "Invalid session." });
    req.user = { id: String(user.id), username: user.username, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session." });
  }
}

/** Express middleware: require an authenticated admin. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
