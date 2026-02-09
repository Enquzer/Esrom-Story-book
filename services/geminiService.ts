import { GoogleGenAI, Type, Modality, Content, Part } from "@google/genai";
import { PageBlueprint, Character, Language } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fullStorySchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'A short, catchy title for the story in the original story language.'
    },
    pages: {
      type: Type.ARRAY,
      description: 'An array of 8 to 10 story pages that form a complete narrative.',
      items: {
        type: Type.OBJECT,
        properties: {
          pageText: {
            type: Type.STRING,
            description: 'A short segment of the story text for a single page. Must be in the original story language. Do NOT repeat the character name/traits constantly. Move the plot forward.',
          },
          imagePrompt: {
            type: Type.STRING,
            description: 'A vivid, descriptive prompt in English for an AI image generator. Describe the specific action happening in this scene.',
          },
          animation: {
            type: Type.OBJECT,
            description: 'Optional: Identify one word from the pageText that can have a fun, subtle animation. If no suitable word exists, omit this field.',
            properties: {
              keyword: {
                type: Type.STRING,
                description: 'The single word from pageText to animate (e.g., "shined", "jumped"). Must be an exact match from the text.',
              },
              type: {
                type: Type.STRING,
                description: 'The type of animation to apply.',
                enum: ['glow', 'bounce', 'shake', 'spin', 'float'],
              },
            },
          },
        },
        required: ['pageText', 'imagePrompt'],
      },
      minItems: 8,
      maxItems: 10,
    },
  },
  required: ['title', 'pages'],
};


// --- Retry Helper Logic ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000, operationName = "API Call"): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for rate limit (429), quota exhausted (RESOURCE_EXHAUSTED), or server overload (503)
    const isQuotaError = 
        error.status === 429 || 
        error.status === 503 || 
        (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('quota')));

    if (retries > 0 && isQuotaError) {
      console.warn(`[${operationName}] Quota hit or busy. Retrying in ${baseDelay}ms... (${retries} attempts left)`);
      await sleep(baseDelay);
      return withRetry(fn, retries - 1, baseDelay * 2, operationName);
    }
    throw error;
  }
}

export async function generateFullStory(
  character: Character,
  language: Language,
  storyPrompt: string,
): Promise<{ title: string; pages: PageBlueprint[] }> {
  const langName = language === 'am' ? 'Amharic' : 'English';
  
  const systemInstruction = `You are a master storyteller for young children (ages 4-6). You are writing a story about **${character.name}** (${character.appearance}, special trait: ${character.trait}).

**STORY GOAL:**
Write a coherent, linear story about: ${storyPrompt}.

**CRITICAL RULES FOR LOGICAL FLOW:**
1.  **Structure:** You MUST follow this specific arc:
    *   **Page 1:** Introduction (Introduce the hero and the setting).
    *   **Page 2-3:** The Problem (Something specific happens or a quest begins).
    *   **Page 4-6:** The Adventure (They travel to a specific place or face a specific challenge).
    *   **Page 7:** The Climax (The most exciting moment).
    *   **Page 8-10:** The Happy Ending (Resolution and feelings).
2.  **NO REPETITION:** 
    *   Do NOT repeat the introduction on Page 2. 
    *   Do NOT keep saying "This is a story about..." or listing the character's traits on every page. 
    *   Assume the reader knows who the character is after Page 1. Use pronouns ("He", "She") or just the name.
3.  **Continuity:** Page 2 must follow Page 1. Page 3 must follow Page 2. It is one continuous story, not random scenes.
    *   **Bad:** Page 2: "Leo is a boy who likes cars." Page 3: "Leo is a boy who went to the park."
    *   **Good:** Page 2: "Leo hopped into his red race car." Page 3: "He zoomed all the way to the big park."
4.  **Language:** Write the story text and title in **${langName}**. Image prompts must be in **English**.
5.  **Length:** 8 to 10 pages. Each page text must be short (approx 20 words). Simple sentences.
6.  **Animation:** Pick one action word per page to animate if applicable.
7.  **JSON ONLY:** Return only valid JSON matching the schema.

**Example of Flow:**
Page 1: "Leo sat in his garden looking at the sky."
Page 2: "Suddenly, a glowing blue bug flew past his nose!" (Action, not description)
Page 3: "He chased the bug all the way to the magic forest." (Movement)
`;

  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Write a story about ${character.name} based on the prompt: ${storyPrompt}` }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: fullStorySchema,
        },
      });

      const jsonText = response.text.trim();
      const story = JSON.parse(jsonText) as { title: string; pages: PageBlueprint[] };

      if (!story.title || !story.pages || !Array.isArray(story.pages) || story.pages.length < 8) {
          throw new Error("AI failed to generate a valid, complete story structure.");
      }
      
      const pageTexts = new Set(story.pages.map(p => p.pageText.trim()));
      if (pageTexts.size < story.pages.length - 2) { 
          console.error("AI generated repetitive page content.", story.pages);
          throw new Error("The AI created a story with repetitive pages. Please try generating a new story.");
      }

      return story;
    } catch (error) {
      console.error("Error generating full story:", error);
      if (error instanceof Error && error.message.includes("repetitive pages")) {
        throw error;
      }
      throw error; // Let retry logic handle network/quota errors
    }
  }, 3, 1000, "Generate Story Text");
}


export async function generateSpeech(text: string): Promise<string> {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No audio data received from API.");
      }
      return base64Audio;
    } catch (error) {
      console.error("Error generating speech:", error);
      throw error;
    }
  }, 3, 1000, "Generate Speech");
}

export async function cartoonizeImage(base64Image: string): Promise<string> {
  return withRetry(async () => {
      const mimeType = base64Image.substring(5, base64Image.indexOf(';'));
      const data = base64Image.substring(base64Image.indexOf(',') + 1);

      const prompt = "Turn this photo of a child into a fun, friendly cartoon character for a storybook. Use a vibrant, whimsical style. The character should be the main focus, with a simple or transparent background.";
      
      try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType, data } },
                    { text: prompt },
                ],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
        throw new Error("Cartoonized image could not be generated.");
      } catch (error) {
        console.error("Error cartoonizing image:", error);
        throw error;
      }
  }, 3, 2000, "Cartoonize Image");
}


export async function generateImage(prompt: string, characterImage: string | null): Promise<string> {
  return withRetry(async () => {
      const parts: Part[] = [];
      
      if (characterImage) {
        const mimeType = characterImage.substring(5, characterImage.indexOf(';'));
        const data = characterImage.substring(characterImage.indexOf(',') + 1);
        parts.push({ inlineData: { mimeType, data } });
        parts.push({ text: `Using the provided cartoon character as a reference, create a colorful, vibrant, and imaginative children's storybook illustration of the character in this scene: ${prompt}. Whimsical, fun, friendly cartoon style for a young boy.` });
      } else {
        parts.push({ text: `A colorful, vibrant, and imaginative children's storybook illustration of: ${prompt}. Whimsical, fun, friendly cartoon style for a young boy.` });
      }

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts },
          config: {
            responseModalities: [Modality.IMAGE],
          },
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data received from API.");
      } catch (error) {
        console.error("Error generating image:", error);
        throw error;
      }
  }, 5, 3000, "Generate Illustration"); // Higher retries and delay for images
}
