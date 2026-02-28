import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

// --- Simple Persistence Layer ---
const DATA_DIR = path.resolve("./data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CREDITS_FILE = path.join(DATA_DIR, "credits.json");

function getCredits() {
  if (!fs.existsSync(CREDITS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CREDITS_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}

function saveCredits(credits: any) {
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
}

function getUserCredits(email: string) {
  const credits = getCredits();
  const today = new Date().toISOString().split("T")[0];
  if (!credits[email] || credits[email].date !== today) {
    credits[email] = { date: today, amount: 10 }; // 10 credits per day
    saveCredits(credits);
  }
  return credits[email];
}

// --- API Routes ---

app.get("/api/credits", (req, res) => {
  const email = (req.query.email as string) || "guest";
  res.json(getUserCredits(email));
});

app.post("/api/credits/use", (req, res) => {
  const { email = "guest", amount = 1 } = req.body;
  const credits = getCredits();
  const userCredits = getUserCredits(email);

  if (userCredits.amount >= amount) {
    credits[email].amount -= amount;
    saveCredits(credits);
    return res.json({ success: true, remaining: credits[email].amount });
  }
  res.status(403).json({ error: "Not enough magic credits!" });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
