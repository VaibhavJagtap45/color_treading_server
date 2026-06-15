import { verifyToken } from "../lib/jwt.js";
import { isTokenRevoked } from "../lib/revocation.js";

/** Express middleware: require a valid Bearer token; attaches req.user. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const payload = verifyToken(token);
    if (await isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
    req.user = { id: payload.sub, username: payload.username, role: payload.role };
    req.token = { jti: payload.jti, exp: payload.exp }; // for server-side logout
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/** Express middleware: require an authenticated admin. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
