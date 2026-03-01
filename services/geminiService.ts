import { PageBlueprint, Character, Language } from '../types';

const API_BASE = '/api';

async function handleResponse(response: Response) {
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

  const response = await fetch(`${API_BASE}/generate-story`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character, language, storyPrompt, email }),
  });

  return handleResponse(response);
}

// Phase 1: Generate story text (6 pages) + first 3 images.
// Opens the book fast; last 3 images are loaded by generatePhase2 in background.
export async function generatePhase1(
  character: Character,
  language: Language,
  storyPrompt: string,
  characterImage: string | null,
  email: string = 'guest'
): Promise<{ title: string; pages: (PageBlueprint & { imageUrl: string })[]; phase2Prompts: string[] }> {
  const response = await fetch(`${API_BASE}/generate-phase-1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character, language, storyPrompt, characterImage, email }),
  });
  return handleResponse(response);
}

// Phase 2: Fetch the remaining 3 images in the background.
export async function generatePhase2(
  prompts: string[],
  characterImage: string | null,
  email: string = 'guest'
): Promise<{ images: string[] }> {
  const response = await fetch(`${API_BASE}/generate-phase-2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, characterImage, email }),
  });
  return handleResponse(response);
}

export async function generateSpeech(text: string): Promise<string> {
  const response = await fetch(`${API_BASE}/generate-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await handleResponse(response);
  return data.audioData || "";
}

export async function cartoonizeImage(image: string): Promise<string> {
  const response = await fetch(`${API_BASE}/cartoonize-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const data = await handleResponse(response);
  return data.image;
}

export async function generateImage(prompt: string, characterImage: string | null, email: string = 'guest'): Promise<string> {
  await useCredits(0.5, email);

  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, characterImage, email }),
  });
  const data = await handleResponse(response);
  return data.image;
}

export async function generateStoryVideo(prompt: string, onStatusUpdate?: (msg: string) => void): Promise<string> {
  onStatusUpdate?.("Initiating video generation engine...");
  // Video generation should also be server-side or handled differently.
  // For now, let's keep it as a placeholder or throw a proper error if not implemented on server.
  throw new Error("Video generation is currently being upgraded for the 3.1 engine.");
}

