import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Modality, Type } from "@google/genai";

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// KEY ROTATION MANAGER
// Reads GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... from .env
// Rotates round-robin; auto-skips any key that hits its daily quota (429).
// Each exhausted key is retried after 1 hour (quota resets are rolling daily).
// ═══════════════════════════════════════════════════════════════════════════
class KeyRotationManager {
  private keys: string[];
  private clients: GoogleGenAI[];
  private exhaustedUntil: (number | null)[];  // timestamp when key can be retried
  private currentIndex: number = 0;
  private readonly COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per key

  constructor() {
    // Collect all GEMINI_API_KEY_1, _2, _3 ... from environment
    const collected: string[] = [];
    let i = 1;
    while (process.env[`GEMINI_API_KEY_${i}`]) {
      collected.push(process.env[`GEMINI_API_KEY_${i}`]!);
      i++;
    }
    // Fallback: support legacy single GEMINI_API_KEY
    if (collected.length === 0 && process.env.GEMINI_API_KEY) {
      collected.push(process.env.GEMINI_API_KEY);
    }
    if (collected.length === 0) throw new Error("No Gemini API keys found in environment!");

    this.keys = collected;
    this.clients = collected.map(key => new GoogleGenAI({ apiKey: key }));
    this.exhaustedUntil = new Array(collected.length).fill(null);

    console.log(`🔑 Key Rotation: ${collected.length} API key(s) loaded. [${collected.map((k, i) => `Key${i+1}:...${k.slice(-6)}`).join(', ')}]`);
  }

  /** Get the next available GoogleGenAI client (round-robin, skips exhausted keys) */
  getClient(): GoogleGenAI {
    const now = Date.now();
    const total = this.clients.length;

    // Find the next non-exhausted key starting from currentIndex
    for (let attempt = 0; attempt < total; attempt++) {
      const idx = (this.currentIndex + attempt) % total;
      const cooldownUntil = this.exhaustedUntil[idx];

      if (cooldownUntil === null || now >= cooldownUntil) {
        // This key is available — advance the pointer for next call
        this.currentIndex = (idx + 1) % total;
        return this.clients[idx];
      }
    }

    // All keys are exhausted — calculate soonest recovery
    const soonest = Math.min(...this.exhaustedUntil.filter(Boolean) as number[]);
    const minsLeft = Math.ceil((soonest - now) / 60000);
    throw new Error(`ALL_KEYS_EXHAUSTED: All ${total} API keys have hit their daily quota. Retry in ~${minsLeft} min.`);
  }

  /** Mark a key as quota-exhausted for COOLDOWN_MS. Call this on 429 errors. */
  markExhausted(client: GoogleGenAI): void {
    const idx = this.clients.indexOf(client);
    if (idx === -1) return;
    this.exhaustedUntil[idx] = Date.now() + this.COOLDOWN_MS;
    const remaining = this.exhaustedUntil.filter(t => t === null || Date.now() >= t!).length;
    console.warn(`⚠️  Key${idx + 1} quota exhausted — cooling down 1 hour. ${remaining}/${this.clients.length} keys still active.`);
  }

  get keyCount() { return this.keys.length; }
}

const keyManager = new KeyRotationManager();

/** Check if an error is a quota/rate-limit error */
function isQuotaError(error: any): boolean {
  return (
    error?.status === 429 ||
    error?.code === 429 ||
    error?.message?.includes('429') ||
    error?.message?.includes('RESOURCE_EXHAUSTED') ||
    error?.message?.includes('quota') ||
    error?.message?.includes('ALL_KEYS_EXHAUSTED')
  );
}

/**
 * withKeyRotation — runs fn(client) with automatic key failover.
 * If a quota error is thrown, marks that key exhausted and retries
 * with the next key. Tries every available key before giving up.
 */
async function withKeyRotation<T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> {
  const total = keyManager.keyCount;
  let lastError: any;

  for (let attempt = 0; attempt < total; attempt++) {
    const client = keyManager.getClient(); // throws if ALL_KEYS_EXHAUSTED
    try {
      return await fn(client);
    } catch (err: any) {
      if (isQuotaError(err)) {
        keyManager.markExhausted(client);
        lastError = err;
        // Try next key on next loop iteration
        continue;
      }
      // Non-quota error — rethrow immediately
      throw err;
    }
  }

  // All keys tried and exhausted
  throw lastError ?? new Error('ALL_KEYS_EXHAUSTED: No API keys available');
}

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
          minItems: 6,
          maxItems: 6,
        },
      },
      required: ["title", "pages"],
    };

    const result = await withKeyRotation(client =>
      client.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: `Write a story about ${character?.name} based on: ${storyPrompt}` }] }],
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: fullStorySchema as any },
      })
    );

    const text = result.text;
    if (!text) throw new Error("AI response empty");
    deductCredits(email, 1);
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("generate-story error:", error);
    if (isQuotaError(error)) return res.status(429).json({ error: "All API keys exhausted. Please try again later." });
    res.status(500).json({ error: "AI processing failure" });
  }
});

// --- Shared Imagen 3 helper (with key rotation + failover) ---
async function generateStoryboardImage(prompt: string, hasCharacter: boolean): Promise<string> {
  const characterContext = hasCharacter ? "featuring the main story character" : "";
  const fullPrompt = `Children's storybook illustration ${characterContext}. Scene: ${prompt}. Art style: 3D Pixar animated movie, vibrant saturated colors, magical warm atmosphere, soft rim lighting, whimsical, child-friendly, highly detailed background, cinematic composition.`;

  const response = await withKeyRotation<any>(client =>
    (client.models as any).generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: fullPrompt,
      config: { numberOfImages: 1, aspectRatio: '4:3', outputMimeType: 'image/jpeg' },
    })
  );

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) throw new Error(`Imagen returned no data for prompt: ${prompt.slice(0, 50)}`);
  return `data:image/jpeg;base64,${imageBytes}`;
}

// =====================================================================
// PHASE 1: Generate story text (6 pages) + first 3 images in parallel
// Returns the full story with first 3 imageUrls populated.
// =====================================================================
app.post("/api/generate-phase-1", async (req, res) => {
  try {
    const { character, language, storyPrompt, characterImage, email = "guest" } = req.body;
    if (!checkCredits(email, 1)) return res.status(403).json({ error: "Insufficient credits" });

    const langName = language === "am" ? "Amharic" : "English";
    const systemInstruction = `You are a master storyteller for children. Write a 6-page story about ${character?.name} based on: ${storyPrompt}. Language: ${langName}. Return exactly 6 pages as JSON.`;

    const storySchema = {
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
          minItems: 6,
          maxItems: 6,
        },
      },
      required: ["title", "pages"],
    };

    // Step 1: Generate story text (fast, ~2-3s)
    const textResult = await withKeyRotation(client =>
      client.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: `Write a 6-page story about ${character?.name} based on: ${storyPrompt}` }] }],
        config: { systemInstruction, responseMimeType: "application/json", responseSchema: storySchema as any },
      })
    );

    const text = textResult.text;
    if (!text) throw new Error("AI text response empty");
    const story = JSON.parse(text);
    const pages = story.pages as any[];

    // Step 2: Generate FIRST 3 images in parallel (Imagen 3, key-rotated)
    const hasChar = !!characterImage;
    const first3Results = await Promise.allSettled(
      pages.slice(0, 3).map((p: any) => generateStoryboardImage(p.imagePrompt, hasChar))
    );

    // Assemble response: first 3 get imageUrl, last 3 get empty string (phase 2 will fill them)
    const fullPages = pages.map((p: any, i: number) => ({
      pageText: p.pageText,
      imagePrompt: p.imagePrompt,
      animation: p.animation,
      imageUrl: i < 3
        ? (first3Results[i].status === 'fulfilled' ? (first3Results[i] as PromiseFulfilledResult<string>).value : '')
        : '',  // Empty — phase 2 will fill these
    }));

    deductCredits(email, 1);
    res.json({
      title: story.title,
      pages: fullPages,
      phase2Prompts: pages.slice(3).map((p: any) => p.imagePrompt),
    });

  } catch (error: any) {
    console.error("Phase 1 error:", error);
    if (isQuotaError(error)) return res.status(429).json({ error: "All API keys exhausted. Try text-only mode or wait for quota reset!" });
    res.status(500).json({ error: "Phase 1 generation failed: " + (error?.message || "Unknown") });
  }
});

// =====================================================================
// PHASE 2: Generate remaining 3 images (runs in background)
// =====================================================================
app.post("/api/generate-phase-2", async (req, res) => {
  try {
    const { prompts, characterImage, email = "guest" } = req.body;
    if (!prompts || !Array.isArray(prompts)) return res.status(400).json({ error: "No prompts provided" });

    const hasChar = !!characterImage;

    // Generate last 3 images in parallel
    const results = await Promise.allSettled(
      prompts.map((prompt: string) => generateStoryboardImage(prompt, hasChar))
    );

    const images = results.map(r =>
      r.status === 'fulfilled' ? r.value : ''
    );

    res.json({ images });
  } catch (error: any) {
    console.error("Phase 2 error:", error);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ error: "Daily image limit reached." });
    }
    res.status(500).json({ error: "Phase 2 generation failed: " + (error?.message || "Unknown") });
  }
});

app.post("/api/generate-speech", async (req, res) => {
  try {
    const { text } = req.body;
    const response = await withKeyRotation(client =>
      client.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"] as any,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } as any
        },
      })
    );
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    res.json({ audioData });
  } catch (error: any) {
    console.error("Speech error:", error);
    res.status(500).json({ error: "TTS failure" });
  }
});

app.post("/api/cartoonize-image", async (req, res) => {
  try {
    const { image } = req.body;
    const mimeType = image.substring(5, image.indexOf(";"));
    const data = image.substring(image.indexOf(",") + 1);
    // gemini-2.0-flash-preview-image-generation supports image INPUT + IMAGE OUTPUT
    const response = await withKeyRotation(client =>
      client.models.generateContent({
        model: "gemini-2.0-flash-preview-image-generation",
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType, data } },
          { text: "Transform this person into a cute, vibrant 3D Pixar animated movie character. Keep the face recognizable. Style: child-friendly storybook illustration, soft warm lighting, magical atmosphere." }
        ]}],
        config: { responseModalities: ["IMAGE", "TEXT"] as any },
      })
    );
    const part = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!part) throw new Error("Cartoonize returned no image");
    res.json({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  } catch (error: any) {
    console.error("Cartoonize error:", error);
    res.status(500).json({ error: "Photo cartoonization failed: " + (error?.message || "Unknown") });
  }
});

app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, characterImage, email = "guest" } = req.body;
    if (!checkCredits(email, 0.5)) return res.status(403).json({ error: "Insufficient credits" });

    // Build an enriched, storybook-quality prompt for Imagen 3
    const characterContext = characterImage
      ? "featuring the main story character"
      : "";
    const fullPrompt = `Children's storybook illustration ${characterContext}. Scene: ${prompt}. Art style: 3D Pixar animated movie, vibrant saturated colors, magical warm atmosphere, soft rim lighting, whimsical, child-friendly, highly detailed background, cinematic composition.`;

    // Use Imagen 3 via key rotation — automatic failover if one key is exhausted
    const response = await withKeyRotation<any>(client =>
      (client.models as any).generateImages({
        model: 'imagen-3.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '4:3',
          outputMimeType: 'image/jpeg',
        },
      })
    );

    const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) throw new Error("Imagen returned no image data");

    deductCredits(email, 0.5);
    res.json({ image: `data:image/jpeg;base64,${imageBytes}` });

  } catch (error: any) {
    console.error("generate-image error:", error);
    if (isQuotaError(error)) return res.status(429).json({ error: "All API keys exhausted. Try again later or use text-only mode!" });
    res.status(500).json({ error: "Image generation failed: " + (error?.message || "Unknown error") });
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
