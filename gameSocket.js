import { getGameState, gameEvents, PAYOUTS } from "./gameEngine.js";
import { verifyToken } from "./lib/jwt.js";
import { isTokenRevoked } from "./lib/revocation.js";
import { User } from "./models/User.js";
import { Transaction } from "./models/Transaction.js";

const VALID_COLORS = ["red", "green", "violet"];

// Bets for the in-flight round, keyed by userId (survives socket reconnects so a
// user's bets still settle if they drop and come back). Cleared each round.
const roundBets = new Map(); // userId -> [{ roundId, color, number, amount }]

/**
 * Wire the authenticated, DB-backed game socket layer.
 *
 * The wallet is the persistent source of truth in MongoDB:
 *   - placeBet atomically debits the stake (guarded by sufficient balance)
 *   - settlement atomically credits winnings
 *   - every movement is written to the Transaction ledger
 */
export function attachGameSocket(io) {
  // --- Socket authentication: require a valid JWT in the handshake. ---
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = verifyToken(token);
      if (await isTokenRevoked(payload.jti)) {
        return next(new Error("Invalid or expired token"));
      }
      socket.data.user = { id: payload.sub, username: payload.username, role: payload.role };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  // --- Lightweight state broadcast every second. ---
  const broadcast = () => {
    const { roundId, phase, timeLeft } = getGameState();
    io.emit("gameState", { roundId, phase, timeLeft });
  };
  const ticker = setInterval(broadcast, 1000);

  // --- On resolution: announce result, settle wallets, refresh state. ---
  gameEvents.on("roundResolved", async (result) => {
    io.emit("roundResult", {
      roundId: result.roundId,
      number: result.number,
      colors: result.colors,
    });
    try {
      await settleRound(io, result);
    } catch (err) {
      console.error("Settlement error:", err);
    }
    broadcast();
  });

  gameEvents.on("roundStart", broadcast);

  io.on("connection", async (socket) => {
    const { id: userId, username } = socket.data.user;
    socket.join(`user:${userId}`); // all of a user's tabs share a room
    console.log(`Socket connected: ${socket.id} (user ${username})`);

    // Initial sync from the persistent wallet.
    const user = await User.findById(userId).select("balance");
    socket.emit("balanceUpdate", { balance: user?.balance ?? 0 });

    const state = getGameState();
    socket.emit("gameState", {
      roundId: state.roundId,
      phase: state.phase,
      timeLeft: state.timeLeft,
    });
    socket.emit("historySync", state.history);
    if (state.phase === "result" && state.result) {
      socket.emit("roundResult", {
        roundId: state.result.roundId,
        number: state.result.number,
        colors: state.result.colors,
      });
    }

    socket.on("placeBet", async (payload, ack) => {
      const outcome = await placeBet(userId, payload);
      if (!outcome.ok) {
        socket.emit("betRejected", { reason: outcome.reason, payload });
        if (typeof ack === "function") ack({ ok: false, reason: outcome.reason });
        return;
      }
      // Stake debited from the wallet -> push the new balance to every tab.
      io.to(`user:${userId}`).emit("balanceUpdate", { balance: outcome.balance });
      socket.emit("betPlaced", { bet: outcome.bet, balance: outcome.balance });
      if (typeof ack === "function") {
        ack({ ok: true, bet: outcome.bet, balance: outcome.balance });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return () => {
    clearInterval(ticker);
    gameEvents.removeListener("roundStart", broadcast);
  };
}

/**
 * Validate + record a bet, atomically debiting the wallet.
 * Returns { ok: true, bet, balance } or { ok: false, reason }.
 */
async function placeBet(userId, payload) {
  const { roundId, phase } = getGameState();
  if (phase !== "betting") {
    return { ok: false, reason: "Betting is closed for this round." };
  }

  const parsed = normalizeBet(payload);
  if (!parsed.ok) return parsed;
  const { color, number, amount } = parsed;

  // Atomic check-and-debit: only succeeds if balance >= amount.
  const user = await User.findOneAndUpdate(
    { _id: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );
  if (!user) return { ok: false, reason: "Insufficient balance." };

  const bet = { roundId, color, number, amount };
  const list = roundBets.get(userId) || [];
  list.push(bet);
  roundBets.set(userId, list);

  await Transaction.create({
    user: userId,
    type: "bet",
    amount: -amount,
    roundId,
    balanceAfter: user.balance,
  });

  return { ok: true, bet, balance: user.balance };
}

/** Validate/coerce a raw { color, number, amount } payload into one wager. */
function normalizeBet(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "Invalid bet payload." };
  }

  let { color, number, amount } = payload;

  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Bet amount must be a positive number." };
  }

  const hasColor = color !== undefined && color !== null && color !== "";
  const hasNumber = number !== undefined && number !== null && number !== "";

  if (hasColor === hasNumber) {
    return { ok: false, reason: "Bet on exactly one of a color or a number." };
  }

  if (hasColor) {
    color = String(color).toLowerCase();
    if (!VALID_COLORS.includes(color)) {
      return { ok: false, reason: `Color must be one of: ${VALID_COLORS.join(", ")}.` };
    }
    return { ok: true, color, number: null, amount };
  }

  number = Number(number);
  if (!Number.isInteger(number) || number < 0 || number > 9) {
    return { ok: false, reason: "Number must be an integer 0–9." };
  }
  return { ok: true, color: null, number, amount };
}

/** Settle every user's bets for the resolved round, crediting winnings. */
async function settleRound(io, result) {
  for (const [userId, bets] of roundBets) {
    const settling = bets.filter((b) => b.roundId === result.roundId);
    if (settling.length === 0) continue;

    // Remove settled bets up front so a slow await can't double-settle.
    const remaining = bets.filter((b) => b.roundId !== result.roundId);
    if (remaining.length) roundBets.set(userId, remaining);
    else roundBets.delete(userId);

    let winnings = 0;
    for (const bet of settling) {
      if (bet.color && result.colors.includes(bet.color)) {
        winnings += bet.amount * PAYOUTS[bet.color];
      } else if (bet.number !== null && bet.number === result.number) {
        winnings += bet.amount * PAYOUTS.number;
      }
    }

    let balanceAfter;
    if (winnings > 0) {
      const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: winnings } },
        { new: true }
      );
      balanceAfter = user?.balance ?? 0;
      await Transaction.create({
        user: userId,
        type: "payout",
        amount: winnings,
        roundId: result.roundId,
        balanceAfter,
      });
    } else {
      const user = await User.findById(userId).select("balance");
      balanceAfter = user?.balance ?? 0;
    }

    io.to(`user:${userId}`).emit("balanceUpdate", {
      balance: balanceAfter,
      roundId: result.roundId,
      winnings,
    });
  }
}
