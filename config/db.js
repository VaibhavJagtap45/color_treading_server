import mongoose from "mongoose";

let memoryServer = null;

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

  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
