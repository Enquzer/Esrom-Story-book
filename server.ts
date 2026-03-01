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
const DATA_DIR = process.env.VERCEL ? "/tmp/data" : path.resolve("./data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// --- Gemini AI Proxy Routes ---

/** POST /api/generate-story  { character, language, storyPrompt } */
app.post("/api/generate-story", async (req, res) => {
  try {
    const { character, language, storyPrompt, email = "guest" } = req.body;
    
    // Validate credits
    const userCredits = getUserCredits(email);
    if (userCredits.amount < 1) {
      return res.status(403).json({ error: "Not enough magic credits!" });
    }

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

    console.log("Generating story with prompt:", storyPrompt);
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: `Write a story about ${character?.name} based on: ${storyPrompt}` }] }],
      config: { 
        systemInstruction,
        responseMimeType: "application/json", 
        responseSchema: fullStorySchema as any
      },
    });

    const text = result.text;
    if (!text) throw new Error("No text returned from Gemini");
    console.log("Gemini Response received");

    // Deduct credit only on success
    const credits = getCredits();
    credits[email].amount -= 1;
    saveCredits(credits);

    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini generate-story DETAIL:", error);
    res.status(500).json({ error: "Failed to generate story: " + (error.message || "AI engine error") });
  }
});

/** POST /api/generate-speech  { text } */
app.post("/api/generate-speech", async (req, res) => {
  try {
    const { text } = req.body;
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO] as any,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } as any,
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    res.json({ audioData });
  } catch (error: any) {
    console.error("Gemini generate-speech error:", error);
    res.status(500).json({ error: "Failed to generate speech" });
  }
});

/** POST /api/cartoonize-image  { image: base64DataUrl } */
app.post("/api/cartoonize-image", async (req, res) => {
  try {
    const { image } = req.body;
    const mimeType = image.substring(5, image.indexOf(";"));
    const data = image.substring(image.indexOf(",") + 1);
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }, { text: "Cartoonize this character for a storybook. Style: 3D Pixar movie." }] }],
      config: { responseModalities: [Modality.IMAGE] as any },
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) return res.status(500).json({ error: "No image generated" });
    res.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  } catch (error: any) {
    console.error("Gemini cartoonize error:", error);
    res.status(500).json({ error: "Failed to cartoonize image" });
  }
});

/** POST /api/generate-image  { prompt, characterImage?: base64DataUrl } */
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, characterImage, email = "guest" } = req.body;
    
    // Validate credits
    const userCredits = getUserCredits(email);
    if (userCredits.amount < 0.5) {
      return res.status(403).json({ error: "Not enough magic credits!" });
    }

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
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts }],
      config: { responseModalities: [Modality.IMAGE] as any },
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) return res.status(500).json({ error: "No image data" });

    // Deduct credit
    const credits = getCredits();
    credits[email].amount -= 0.5;
    saveCredits(credits);

    res.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  } catch (error: any) {
    console.error("Gemini generate-image error:", error);
    const status = error.status === 429 || error.code === 429 ? 429 : 500;
    res.status(status).json({ error: "Failed to generate image" });
  }
});

// --- Vite Middleware ---
async function startServer() {
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
