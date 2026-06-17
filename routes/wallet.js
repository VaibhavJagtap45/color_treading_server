import { Router } from "express";
import { Transaction } from "../models/Transaction.js";
import { getGuestUser } from "../lib/guestUser.js";

const router = Router();

// Current balance + the latest 20 ledger entries for the shared guest wallet.
// Auth removed — no session required.
router.get("/", async (req, res) => {
  const user = await getGuestUser();

  const transactions = await Transaction.find({ user: user.id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ balance: user.balance, transactions });
});

export default router;
