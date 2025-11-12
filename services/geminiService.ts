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
            description: 'A short segment of the story text for a single page. Must be in the original story language, incorporate the main character\'s details, and be around 20 words.',
          },
          imagePrompt: {
            type: Type.STRING,
            description: 'A vivid, descriptive prompt in English for an AI image generator to create a fun, colorful illustration for a young boy, featuring the main character based on their description.',
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


export async function generateFullStory(
  character: Character,
  language: Language,
  storyPrompt: string,
): Promise<{ title: string; pages: PageBlueprint[] }> {
  const langName = language === 'am' ? 'Amharic' : 'English';
  
  const systemInstruction = `You are a storyteller for a young boy (around 4-6 years old), creating a fun, complete adventure.
**CRITICAL RULES:**
1.  **Main Character:** The hero is **${character.name}**.
2.  **Appearance:** They look like this: **${character.appearance}**.
3.  **Special Trait:** Their unique ability is: **${character.trait}**.
4.  **Story Topic:** The story should be about: **${storyPrompt}**.
5.  **CONSISTENCY IS KEY:** You MUST maintain these character details in every part of the story text and every image prompt.
6.  **Language:** The story text and title MUST be in **${langName}**. Image prompts MUST be in **English**.
7.  **Story Structure:**
    - Create a complete story with a clear beginning, middle, and a happy, satisfying end.
    - The story MUST have between 8 and 10 pages.
    - Each page's text MUST be very short, around 20 words maximum.
    - Use very simple vocabulary and short sentences, suitable for a child who is just learning to read. Avoid scary or complex themes. The tone should be light and positive.
8.  **Story Flow:** CRITICAL: Every page must be unique. Each page MUST be a distinct, sequential part of the story. DO NOT repeat scenes or text. The narrative must flow logically from one page to the next.
9.  **Interactive Animation:** For each page, if you find a suitable action or descriptive word (like "jumped," "sparkled," "flew," "shivered," "spun"), add an 'animation' object. Pick only one word per page. If no word fits, do not add the animation object.
10. **JSON ONLY:** Your entire response must be ONLY a valid JSON object matching the schema. No extra text or explanations.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: `Write a story about ${character.name} who ${character.trait} and is on an adventure about ${storyPrompt}.` }] }],
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
    // Add a check for repetitive content to fix the repeating pages bug.
    const pageTexts = new Set(story.pages.map(p => p.pageText.trim()));
    if (pageTexts.size < story.pages.length - 2) { // Allow for 2 pages to be similar, but not more.
        console.error("AI generated repetitive page content.", story.pages);
        throw new Error("The AI created a story with repetitive pages. Please try generating a new story.");
    }

    return story;
  } catch (error) {
    console.error("Error generating full story:", error);
    if (error instanceof Error && error.message.includes("repetitive pages")) {
      throw error;
    }
    throw new Error("Failed to generate the story. Please try again.");
  }
}


export async function generateSpeech(text: string): Promise<string> {
  // The prompt is simplified to just the text.
  // Providing English instructions for Amharic text was causing the API to fail.
  // The model should infer the language and provide a suitable narration.
  const promptText = text;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // Kore is a versatile, clear voice suitable for storytelling
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
    throw new Error("Failed to generate audio for the story.");
  }
}

export async function cartoonizeImage(base64Image: string): Promise<string> {
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
    throw new Error("Failed to turn the photo into a cartoon. Please try another image.");
  }
}


export async function generateImage(prompt: string, characterImage: string | null): Promise<string> {
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
    throw new Error("Failed to generate an image for the story. Please try again.");
  }
}