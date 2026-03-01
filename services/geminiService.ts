/**
 * geminiService.ts  –  FRONTEND-SAFE
 *
 * This file contains NO Gemini API key and NO @google/genai imports.
 * Every AI call is proxied through our own Express backend (server.ts),
 * which reads GEMINI_API_KEY from the server-side .env file.
 *
 * Flow:  Browser  →  /api/*  →  server.ts  →  Google Gemini
 */

import { PageBlueprint, Character, Language } from '../types';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function handleResponse(response: Response) {
  if (response.status === 429) {
    throw new Error('QUOTA_EXHAUSTED');
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

// ---------------------------------------------------------------------------
// Public API (same signatures as before – no changes needed in App.tsx etc.)
// ---------------------------------------------------------------------------

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
    body: JSON.stringify({ character, language, storyPrompt }),
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
  return data.audioData ?? '';
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

export async function generateImage(
  prompt: string,
  characterImage: string | null,
  email: string = 'guest'
): Promise<string> {
  await useCredits(0.5, email);

  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, characterImage }),
  });
  const data = await handleResponse(response);
  return data.image;
}

// generateStoryVideo is intentionally omitted from the proxy for now –
// Video generation via Veo requires a long-polling loop better suited to
// a dedicated server-sent-events endpoint. Open a new request if needed.
export async function generateStoryVideo(
  _prompt: string,
  onStatusUpdate?: (msg: string) => void
): Promise<string> {
  onStatusUpdate?.('Video generation is currently unavailable.');
  throw new Error('Video generation is not yet supported via the proxy.');
}
