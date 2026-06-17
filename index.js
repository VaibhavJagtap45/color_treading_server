import "dotenv/config"; // load .env before anything reads process.env
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { startGameLoop, getGameState } from "./gameEngine.js";
import { attachGameSocket } from "./gameSocket.js";
import { connectDB } from "./config/db.js";
import walletRoutes from "./routes/wallet.js";

const PORT = process.env.PORT || 4000;
// CLIENT_ORIGIN may be a single origin or a comma-separated list. Trailing
// slashes are stripped so "https://app.vercel.app/" and "...app" both match.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Decide whether a browser Origin is allowed. We accept: any origin explicitly
// listed in CLIENT_ORIGIN, any localhost port (dev), and ANY *.vercel.app host.
// The Vercel wildcard means the deployed frontend keeps working even when its
// subdomain changes between deployments/previews — no env change needed.
function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser clients (curl, server-to-server, health checks)
  const clean = origin.replace(/\/$/, "");
  if (ALLOWED_ORIGINS.includes(clean)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(clean)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(clean)) return true;
  return false;
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) cb(null, true);
    else cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

const app = express();

// --- Middleware ---
app.use(cors(corsOptions));
app.use(express.json());

// --- REST routes ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Current game state (read-only snapshot from the engine).
app.get("/api/game/state", (req, res) => {
  res.json(getGameState());
});

app.use("/api/wallet", walletRoutes);

// --- HTTP + Socket.IO server ---
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Wire the DB-backed game socket layer (no auth — shared guest wallet).
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
