import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Modality, Type } from "@google/genai";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.resolve("./public")));

// --- Simple Persistence Layer ---
const DATA_DIR = process.env.VERCEL ? "/tmp" : path.resolve("./data");
const CREDITS_FILE = path.join(DATA_DIR, "credits.json");

function getCredits() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CREDITS_FILE)) return {};
    const content = fs.readFileSync(CREDITS_FILE, "utf-8");
    if (!content.trim()) return {};
    return JSON.parse(content);
  } catch (e) {
    console.error("Error reading credits:", e);
    return {};
  }
}

function saveCredits(credits: any) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
    return true;
  } catch (e) {
    console.error("Error saving credits:", e);
    return false;
  }
}

function getOrInitUserCredits(credits: any, email: string) {
  const today = new Date().toISOString().split("T")[0];
  if (!credits[email] || credits[email].date !== today) {
    credits[email] = { date: today, amount: 10 };
  }
  return credits[email];
}

function checkCredits(email: string, amount: number) {
  const credits = getCredits();
  const userCredits = getOrInitUserCredits(credits, email);
  return userCredits.amount >= amount;
}

function deductCredits(email: string, amount: number) {
  const credits = getCredits();
  const userCredits = getOrInitUserCredits(credits, email);
  userCredits.amount -= amount;
  return saveCredits(credits);
}

// --- API Routes ---

app.get("/api/credits", (req, res) => {
  try {
    const email = (req.query.email as string) || "guest";
    const credits = getCredits();
    const userCredits = getOrInitUserCredits(credits, email);
    saveCredits(credits);
    res.json(userCredits);
  } catch (e: any) {
    console.error("GET credits error:", e);
    res.status(500).json({ error: "Could not fetch credits" });
  }
});

app.post("/api/credits/use", (req, res) => {
  try {
    const { email = "guest", amount = 1 } = req.body;
    const credits = getCredits();
    const userCredits = getOrInitUserCredits(credits, email);

    if (userCredits.amount >= amount) {
      userCredits.amount -= amount;
      if (saveCredits(credits)) {
        return res.json({ success: true, remaining: userCredits.amount });
      } else {
        throw new Error("Failed to write to disk");
      }
    }
    res.status(403).json({ error: "Not enough magic credits!" });
  } catch (e: any) {
    console.error("POST use credits error:", e);
    res.status(500).json({ error: "Internal credit system error" });
  }
});

// --- Gemini AI Proxy Routes ---

app.post("/api/generate-story", async (req, res) => {
  try {
    const { character, language, storyPrompt, email = "guest" } = req.body;
    if (!checkCredits(email, 1)) return res.status(403).json({ error: "Insufficient credits" });

    const langName = language === "am" ? "Amharic" : "English";
    const systemInstruction = `You are a master storyteller for children. Write a story about ${character?.name} based on: ${storyPrompt}. Language: ${langName}. Return JSON.`;

    const fullStorySchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        pages: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pageText: { type: Type.STRING },
              imagePrompt: { type: Type.STRING },
              animation: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["glow", "bounce", "shake", "spin", "float"] },
                },
              },
            },
            required: ["pageText", "imagePrompt"],
          },
          minItems: 8,
          maxItems: 10,
        },
      },
      required: ["title", "pages"],
    };

    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash-latest",
      contents: [{ role: "user", parts: [{ text: `Write a story about ${character?.name} based on: ${storyPrompt}` }] }],
      config: { 
        systemInstruction,
        responseMimeType: "application/json", 
        responseSchema: fullStorySchema as any
      },
    });

    const text = result.text;
    if (!text) throw new Error("AI response empty");
    deductCredits(email, 1);
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini generate-story error:", error);
    res.status(500).json({ error: "AI processing failure" });
  }
});

app.post("/api/generate-speech", async (req, res) => {
  try {
    const { text } = req.body;
    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash-latest",
      contents: [{ role: "user", parts: [{ text }] }],
      config: { 
        responseModalities: ["AUDIO"] as any,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } as any
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    res.json({ audioData });
  } catch (error: any) {
    console.error("Gemini speech error:", error);
    res.status(500).json({ error: "TTS failure" });
  }
});

app.post("/api/cartoonize-image", async (req, res) => {
  try {
    const { image } = req.body;
    const mimeType = image.substring(5, image.indexOf(";"));
    const data = image.substring(image.indexOf(",") + 1);
    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash-latest",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }, { text: "Cartoonize this character for a storybook. Style: 3D Pixar movie." }] }],
      config: { responseModalities: ["IMAGE"] as any },
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) throw new Error("Imaging failure");
    res.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  } catch (error: any) {
    console.error("Gemini cartoonize error:", error);
    res.status(500).json({ error: "Imaging processing failure" });
  }
});

app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, characterImage, email = "guest" } = req.body;
    if (!checkCredits(email, 0.5)) return res.status(403).json({ error: "Insufficient credits" });

    const parts: any[] = [];
    if (characterImage) {
      const mimeType = characterImage.substring(5, characterImage.indexOf(";"));
      const data = characterImage.substring(characterImage.indexOf(",") + 1);
      parts.push({ inlineData: { mimeType, data } });
      parts.push({ text: `Storybook illustration of the character in this scene: ${prompt}. Style: 3D Pixar movie, vibrant, magical.` });
    } else {
      parts.push({ text: `Storybook illustration: ${prompt}. Style: 3D Pixar movie, vibrant, magical.` });
    }

    const response = await genAI.models.generateContent({
      model: "gemini-1.5-flash-latest",
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE"] as any },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) throw new Error("Imaging failure");
    deductCredits(email, 0.5);
    res.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  } catch (error: any) {
    console.error("Gemini image error:", error);
    res.status(500).json({ error: "Image generation failure" });
  }
});

// --- Vite Middleware ---
async function startServer() {
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({ server: { middlewareMode: true }, appType: "custom" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.use(async (req, res, next) => {
    if (req.method !== "GET" || req.originalUrl.startsWith("/api")) return next();
    try {
      let template = fs.readFileSync(path.resolve(process.env.NODE_ENV !== "production" ? "./index.html" : "./dist/index.html"), "utf-8");
      if (vite) template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e: any) {
      if (vite) vite.ssrFixStacktrace(e);
      res.status(500).end(e.stack);
    }
  });

  if (!process.env.VERCEL) app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

if (!process.env.VERCEL) startServer();
export default app;
