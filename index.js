import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { startGameLoop, getGameState } from "./gameEngine.js";
import { attachGameSocket } from "./gameSocket.js";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();

// --- Middleware ---
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// --- REST routes ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Current game state (read-only snapshot from the engine).
app.get("/api/game/state", (req, res) => {
  res.json(getGameState());
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);

// --- HTTP + Socket.IO server ---
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Wire the authenticated, DB-backed game socket layer.
attachGameSocket(io);

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    startGameLoop(); // begin continuous rounds on boot
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
