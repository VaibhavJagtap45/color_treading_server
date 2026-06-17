import { User } from "../models/User.js";

// Auth has been removed: everyone plays as a single shared "guest" wallet.
// This find-or-creates that user atomically (upsert avoids a race when several
// sockets connect at once) so the persistent balance/ledger keeps working.
const GUEST_USERNAME = "guest";
const STARTING_BALANCE = 1000;

export async function getGuestUser() {
  return User.findOneAndUpdate(
    { username: GUEST_USERNAME },
    { $setOnInsert: { username: GUEST_USERNAME, balance: STARTING_BALANCE } },
    { new: true, upsert: true }
  );
}
