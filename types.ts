
export interface Page {
  pageText: string;
  imageUrl: string;
  imagePrompt: string;
  animation?: {
    keyword: string;
    type: 'glow' | 'bounce' | 'shake' | 'spin' | 'float';
  };
}

export interface PageBlueprint {
  pageText: string;
  imagePrompt: string;
  animation?: {
    keyword: string;
    type: 'glow' | 'bounce' | 'shake' | 'spin' | 'float';
  };
}

export interface SavedStoryPage {
  pageText: string;
  imagePrompt: string;
  animation?: {
    keyword: string;
    type: 'glow' | 'bounce' | 'shake' | 'spin' | 'float';
  };
  imageUrl?: string;
  audioData?: string | null;
}


export type Language = 'en' | 'am';

export interface Character {
  name: string;
  appearance: string;
  trait: string;
}

export interface SavedStory {
  id: string;
  title: string;
  character: Character;
  characterImage: string | null; // The original user-uploaded image
  pages: SavedStoryPage[];
  language: Language;
  createdAt: number;
}
