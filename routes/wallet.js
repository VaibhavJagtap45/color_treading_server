import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";

const router = Router();

// Current balance + the latest 20 ledger entries for the signed-in user.
router.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("balance");
  if (!user) return res.status(404).json({ error: "User not found." });

  const transactions = await Transaction.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ balance: user.balance, transactions });
});

export default router;
