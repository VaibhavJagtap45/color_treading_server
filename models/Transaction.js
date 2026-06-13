import mongoose from "mongoose";

/**
 * Append-only ledger of every wallet movement. `amount` is signed:
 * negative for a placed bet (stake), positive for a payout (winnings).
 * `balanceAfter` snapshots the wallet right after the movement.
 */
const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["bet", "payout"], required: true },
    amount: { type: Number, required: true },
    roundId: { type: Number },
    balanceAfter: { type: Number, required: true },
    meta: { type: Object },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model("Transaction", transactionSchema);
