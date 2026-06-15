import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signToken } from "../lib/jwt.js";
import { revokeToken } from "../lib/revocation.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const STARTING_BALANCE = 1000;

function cleanCredentials(body) {
  return {
    username: String(body?.username || "").trim().toLowerCase(),
    password: String(body?.password || ""),
  };
}

router.post("/register", async (req, res) => {
  try {
    const { username, password } = cleanCredentials(req.body);
    if (username.length < 3)
      return res.status(400).json({ error: "Username must be at least 3 characters." });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    if (await User.findOne({ username }))
      return res.status(409).json({ error: "Username is already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, balance: STARTING_BALANCE });

    res.status(201).json({ token: signToken(user), user: user.toJSON() });
  } catch {
    res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = cleanCredentials(req.body);
    const user = await User.findOne({ username });
    // Same response whether the user exists or not (avoid user enumeration).
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: "Invalid username or password." });

    res.json({ token: signToken(user), user: user.toJSON() });
  } catch {
    res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: user.toJSON() });
});

// Server-side logout: revoke the presented token so it can't be reused, even
// before it would naturally expire.
router.post("/logout", requireAuth, async (req, res) => {
  try {
    await revokeToken(req.token);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed." });
  }
});

export default router;
