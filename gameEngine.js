import crypto from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * In-memory continuous round engine for the color prediction game.
 *
 * Round timeline (30s total):
 *   [0s ............... 25s] betting phase  (result hidden, bets accepted)
 *   [25s .............. 30s] result phase   (result revealed)
 *   -> immediately rolls into the next round
 *
 * `timeLeft` is the whole seconds remaining IN THE CURRENT PHASE:
 *   - betting: counts 25 -> 0  (time left to place a bet)
 *   - result:  counts  5 -> 0  (how long the result stays on screen)
 */

const BETTING_MS = 25_000;
const RESULT_MS = 5_000;
const ROUND_MS = BETTING_MS + RESULT_MS; // 30s
const HISTORY_LIMIT = 20;

// Payout multipliers the betting/settlement system uses.
export const PAYOUTS = Object.freeze({
  red: 2,
  green: 2,
  violet: 4.5,
  number: 9, // exact number match
});

/**
 * Domain events the socket layer subscribes to:
 *   "roundStart"    -> { roundId }                    (new betting phase opened)
 *   "roundResolved" -> { roundId, number, colors }    (draw made; settle bets)
 */
export const gameEvents = new EventEmitter();

const state = {
  roundId: 0,
  phase: "betting", // "betting" | "result"
  roundStartTime: 0, // ms epoch; transitions are derived from this
  result: null, // null while betting; { roundId, number, colors } while result
  history: [], // most-recent-first, capped at HISTORY_LIMIT
};

let started = false;
let bettingTimer = null;
let roundTimer = null;

/**
 * Map a winning number (0–9) to its colors.
 *   0           -> red + violet
 *   5           -> green + violet
 *   1,3,7,9 odd -> green
 *   2,4,6,8 even -> red
 */
export function colorsForNumber(n) {
  if (n === 0) return ["red", "violet"];
  if (n === 5) return ["green", "violet"];
  return n % 2 === 0 ? ["red"] : ["green"];
}

// Cryptographically strong, uniform integer in [0, 9] — harder to predict
// than Math.random(), which matters for a wagering game.
function drawNumber() {
  return crypto.randomInt(0, 10);
}

function startRound() {
  state.roundId += 1;
  state.phase = "betting";
  state.roundStartTime = Date.now();
  state.result = null;

  bettingTimer = setTimeout(endBetting, BETTING_MS);
  roundTimer = setTimeout(endRound, ROUND_MS);

  gameEvents.emit("roundStart", { roundId: state.roundId });
}

function endBetting() {
  const number = drawNumber();
  state.result = {
    roundId: state.roundId,
    number,
    colors: colorsForNumber(number),
  };
  state.phase = "result";

  gameEvents.emit("roundResolved", { ...state.result });
}

function endRound() {
  if (state.result) {
    state.history.unshift({
      roundId: state.result.roundId,
      number: state.result.number,
      colors: state.result.colors,
      time: Date.now(),
    });
    if (state.history.length > HISTORY_LIMIT) {
      state.history.length = HISTORY_LIMIT;
    }
  }
  startRound();
}

/**
 * Single source of truth for the current game state.
 * `timeLeft` is recomputed live from timestamps on every call, so callers
 * (HTTP polls, socket broadcasts) always get an accurate countdown.
 */
export function getGameState() {
  const now = Date.now();
  const elapsed = now - state.roundStartTime;
  const phaseEndMs = state.phase === "betting" ? BETTING_MS : ROUND_MS;
  const timeLeft = Math.max(0, Math.ceil((phaseEndMs - elapsed) / 1000));

  return {
    roundId: state.roundId,
    phase: state.phase,
    timeLeft,
    result: state.result, // null during betting — never leaks the draw early
    history: state.history,
    payouts: PAYOUTS,
    serverTime: now, // lets clients sync their local countdown
  };
}

/** Start the continuous loop. Idempotent — safe to call once on boot. */
export function startGameLoop() {
  if (started) return getGameState();
  started = true;
  startRound();
  return getGameState();
}

/** Stop the loop (useful for tests / graceful shutdown). */
export function stopGameLoop() {
  clearTimeout(bettingTimer);
  clearTimeout(roundTimer);
  started = false;
}
