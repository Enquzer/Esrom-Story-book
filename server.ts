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
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // Changed to custom to handle HTML manually for better reliability
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  // Explicitly serve index.html for all non-API GET routes
  app.use(async (req, res, next) => {
    // Only handle GET requests that don't start with /api
    if (req.method !== "GET" || req.originalUrl.startsWith("/api")) {
      return next();
    }

    const url = req.originalUrl;
    try {
      let template: string;
      if (process.env.NODE_ENV !== "production") {
        // Read index.html from root for development
        template = fs.readFileSync(path.resolve("./index.html"), "utf-8");
        // Transform the HTML through Vite (handles @vite/client and other injections)
        template = await vite.transformIndexHtml(url, template);
      } else {
        // In production, serve the built index.html from dist
        template = fs.readFileSync(path.resolve("./dist/index.html"), "utf-8");
      }
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e: any) {
      if (process.env.NODE_ENV !== "production") {
        vite.ssrFixStacktrace(e);
      }
      console.error("Error serving index.html:", e);
      res.status(500).end(e.stack);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
