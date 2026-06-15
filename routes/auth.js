import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const STARTING_BALANCE = 1000;

function cleanCredentials(body) {
  return {
    username: String(body?.username || "").trim().toLowerCase(),
    password: String(body?.password || ""),
  };
}

// Auth is disabled — any credentials are accepted. We find-or-create a user by
// username so each name keeps its own persistent wallet. The returned "token"
// is simply the user id, used to identify the session on later requests.
async function findOrCreateUser(username) {
  let user = await User.findOne({ username });
  if (!user) user = await User.create({ username, balance: STARTING_BALANCE });
  return user;
}

router.post("/register", async (req, res) => {
  try {
    const { username } = cleanCredentials(req.body);
    if (username.length < 3)
      return res.status(400).json({ error: "Username must be at least 3 characters." });

    const user = await findOrCreateUser(username);
    res.status(201).json({ token: String(user.id), user: user.toJSON() });
  } catch {
    res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username } = cleanCredentials(req.body);
    if (username.length < 3)
      return res.status(400).json({ error: "Username must be at least 3 characters." });

    // No password check — anyone logs in with anything.
    const user = await findOrCreateUser(username);
    res.json({ token: String(user.id), user: user.toJSON() });
  } catch {
    res.status(500).json({ error: "Login failed." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: user.toJSON() });
});

// Auth is disabled, so there's nothing to revoke — logout is effectively a
// client-side action; the server just acknowledges it.
router.post("/logout", requireAuth, async (req, res) => {
  res.json({ ok: true });
});

export default router;
