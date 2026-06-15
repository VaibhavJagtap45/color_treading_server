import mongoose from "mongoose";
import dns from "dns";

let memoryServer = null;

/**
 * mongodb+srv:// URIs require Node's resolver (c-ares) to do an SRV/TXT lookup.
 * On some Windows setups Node picks up a loopback-only DNS server (127.0.0.1)
 * where nothing is listening, so every lookup fails with `querySrv ECONNREFUSED`
 * even though `nslookup` works (Windows uses the interface DNS, Node does not).
 * If the configured resolvers are loopback-only, fall back to public DNS.
 */
function ensureResolvableDns() {
  const servers = dns.getServers();
  const allLoopback = servers.every(
    (s) => s === "127.0.0.1" || s === "::1" || s.startsWith("127.")
  );
  if (servers.length === 0 || allLoopback) {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
    console.log(`⚠  Node DNS was loopback-only (${servers.join(", ") || "none"}); using public DNS for SRV lookups.`);
  }
}

/**
 * Connect to MongoDB.
 * - MONGO_URI set        -> use it (real, persistent DB: local or Atlas).
 * - USE_MEMORY_DB=1       -> spin up an in-memory MongoDB (zero-setup dev;
 *                            data is EPHEMERAL, lost on restart).
 * - otherwise             -> default to a local mongod on 127.0.0.1:27017.
 */
export async function connectDB() {
  let uri = process.env.MONGO_URI;

  if (!uri && process.env.USE_MEMORY_DB === "1") {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("colorgame");
    console.log("⚠  Using in-memory MongoDB — data is ephemeral. Set MONGO_URI for real persistence.");
  }

  if (!uri) uri = "mongodb://127.0.0.1:27017/colorgame";

  if (uri.startsWith("mongodb+srv://")) ensureResolvableDns();

  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
