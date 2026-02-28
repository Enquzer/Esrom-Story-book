import { GoogleGenAI, Type, Modality, Part } from "@google/genai";
import { PageBlueprint, Character, Language } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function wrapSDKCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e: any) {
    const isQuota = e.message?.includes('429') || e.status === 429 || e.code === 429;
    const isServiceUnavailable = e.message?.includes('503') || e.status === 503 || e.code === 503 || e.message?.includes('high demand');
    
    if (isQuota || isServiceUnavailable) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw e;
  }
}

const API_BASE = '/api';

async function handleResponse(response: Response) {
  if (response.status === 429) {
    throw new Error("QUOTA_EXHAUSTED");
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }
  return response.json();
}

async function useCredits(amount: number = 1, email: string = 'guest') {
  const response = await fetch(`${API_BASE}/credits/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, amount }),
  });
  return handleResponse(response);
}

export async function getCredits(email: string = 'guest') {
  const response = await fetch(`${API_BASE}/credits?email=${encodeURIComponent(email)}`);
  return handleResponse(response);
}

export async function generateFullStory(
  character: Character,
  language: Language,
  storyPrompt: string,
  email: string = 'guest'
): Promise<{ title: string; pages: PageBlueprint[] }> {
  await useCredits(1, email);

  const langName = language === 'am' ? 'Amharic' : 'English';
  const systemInstruction = `You are a master storyteller for children. Write a story about ${character.name} based on: ${storyPrompt}. Language: ${langName}. Return JSON.`;
  
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
                type: { type: Type.STRING, enum: ['glow', 'bounce', 'shake', 'spin', 'float'] },
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

  const response = await wrapSDKCall(() => ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents: [{ role: 'user', parts: [{ text: `Write a story about ${character.name} based on: ${storyPrompt}` }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: fullStorySchema,
    },
  })) as any;

  return JSON.parse(response.text.trim());
}

export async function generateSpeech(text: string): Promise<string> {
  const response = await wrapSDKCall(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  })) as any;
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
}

export async function cartoonizeImage(image: string): Promise<string> {
  const mimeType = image.substring(5, image.indexOf(';'));
  const data = image.substring(image.indexOf(',') + 1);
  const response = await wrapSDKCall(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ inlineData: { mimeType, data } }, { text: "Cartoonize this character for a storybook. Style: 3D Pixar movie." }],
    },
    config: { responseModalities: [Modality.IMAGE] },
  })) as any;
  const part = response.candidates[0].content.parts.find((p: any) => p.inlineData);
  if (!part) throw new Error("No image generated");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

export async function generateImage(prompt: string, characterImage: string | null, email: string = 'guest'): Promise<string> {
  await useCredits(0.5, email);

  const parts: Part[] = [];
  if (characterImage) {
    const mimeType = characterImage.substring(5, characterImage.indexOf(';'));
    const data = characterImage.substring(characterImage.indexOf(',') + 1);
    parts.push({ inlineData: { mimeType, data } });
    parts.push({ text: `Storybook illustration of the character in this scene: ${prompt}. Style: 3D Pixar movie, vibrant, magical.` });
  } else {
    parts.push({ text: `Storybook illustration: ${prompt}. Style: 3D Pixar movie, vibrant, magical.` });
  }

  const response = await wrapSDKCall(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts },
    config: { 
      responseModalities: [Modality.IMAGE],
      imageConfig: { aspectRatio: "4:3" }
    },
  })) as any;

  const part = response.candidates[0].content.parts.find((p: any) => p.inlineData);
  if (!part) throw new Error("No image data");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}

export async function generateStoryVideo(prompt: string, onStatusUpdate?: (msg: string) => void): Promise<string> {
  onStatusUpdate?.("Initiating video generation engine...");
  
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `Cinematic 3D animation for kids: ${prompt}. High quality, vibrant colors, magical atmosphere.`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  onStatusUpdate?.("Processing frames (this may take 1-2 minutes)...");
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
    onStatusUpdate?.("Adding magical effects to your trailer...");
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed.");
  
  const response = await fetch(`${downloadLink}&key=${process.env.GEMINI_API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
