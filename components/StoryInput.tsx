
import React from 'react';
import { Language, Character, SavedStory } from '../types';
import { translations } from '../translations';

interface StoryInputProps {
  storyPrompt: string;
  setStoryPrompt: (prompt: string) => void;
  character: Character;
  setCharacter: (character: Character) => void;
  characterImage: string | null;
  setCharacterImage: (image: string | null) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isQuotaExhausted: boolean;
  withImages: boolean;
  setWithImages: (val: boolean) => void;
  savedStories?: SavedStory[];
  onLoadSavedStory?: (story: SavedStory) => void;
  onPlayGame?: () => void;
}

const StoryInput: React.FC<StoryInputProps> = ({ 
  storyPrompt, 
  setStoryPrompt, 
  character, 
  setCharacter, 
  characterImage, 
  setCharacterImage, 
  language, 
  setLanguage, 
  onSubmit, 
  isLoading,
  isQuotaExhausted,
  withImages,
  setWithImages,
  savedStories,
  onLoadSavedStory,
  onPlayGame
}) => {
  
  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_SIZE = 1024;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
             reject(new Error("Could not get canvas context"));
             return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const processedImage = await processImage(file);
        setCharacterImage(processedImage);
        setCharacter({ ...character, appearance: 'Based on the uploaded picture' });
        // Auto-enable images if they upload a photo
        setWithImages(true);
      } catch (err) {
        console.error("Image processing failed", err);
        alert("Sorry, we couldn't process that image.");
      }
    }
  };
  
  const removeImage = () => {
      setCharacterImage(null);
      setCharacter({ ...character, appearance: '' });
  };

  const isSubmittable = !isLoading && !isQuotaExhausted && storyPrompt.trim().length >= 10 && character.name.trim().length > 0 && (character.appearance.trim().length > 0 || characterImage) && character.trait.trim().length > 0;
  const t = translations[language];

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 relative">


      <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-800 tracking-tight mt-4">{t.createAdventure}</h2>
      
      {/* Photo Engine Nap Notice */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 flex flex-col items-center text-center space-y-3 shadow-inner">
        <div className="text-4xl">😴</div>
        <p className="font-extrabold text-blue-900 text-lg leading-tight">
          Our photo processing engine needs a nap!
        </p>
        <p className="text-blue-700 text-sm font-medium">
          Generating text-only stories is recommended today.
        </p>
        <button 
          onClick={onPlayGame}
          className="bg-indigo-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-indigo-700 transition-all shadow-md active:scale-95 flex items-center gap-2"
        >
          <span>🎮</span> Play Spaceship Game
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        <div className="space-y-2">
          <label htmlFor="character-name" className="text-sm font-black text-slate-700 uppercase tracking-wide">Hero's Name</label>
          <input
            id="character-name"
            type="text"
            value={character.name}
            onChange={(e) => setCharacter({...character, name: e.target.value})}
            placeholder="e.g., Leo the Brave"
            className="w-full p-3.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="language-select" className="text-sm font-black text-slate-700 uppercase tracking-wide">Story Language</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="w-full p-3.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none appearance-none bg-white font-bold"
          >
            <option value="en">English</option>
            <option value="am">Amharic (አማርኛ)</option>
          </select>
        </div>
      </div>

      {/* Generation Mode Toggle (Redesigned) */}
      <div className="bg-slate-100/80 rounded-2xl p-5 flex items-center justify-between border-2 border-white shadow-sm ring-1 ring-slate-200">
        <div className="flex-1">
          <p className="font-extrabold text-slate-800 flex items-center gap-2 text-lg">
            {withImages ? '✨ Full Picture Book' : '📖 Storybook Text Only'}
          </p>
          <p className="text-sm text-slate-500 font-medium mt-1">
            {withImages ? 'Uses more energy/tokens for illustrations' : 'Faster generation without images'}
          </p>
        </div>
        <button 
          onClick={() => setWithImages(!withImages)}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none shadow-inner ${withImages ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${withImages ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="character-appearance" className="text-sm font-black text-slate-700 uppercase tracking-wide">Hero's Look</label>
          <input
            id="character-appearance"
            type="text"
            value={character.appearance}
            onChange={(e) => setCharacter({...character, appearance: e.target.value})}
            placeholder="e.g., Spiky red hair and a blue cape"
            className="w-full p-3.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all disabled:bg-slate-50 disabled:text-slate-400"
            disabled={isLoading || !!characterImage}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="character-trait" className="text-sm font-black text-slate-700 uppercase tracking-wide">Special Power or Trait</label>
          <input
            id="character-trait"
            type="text"
            value={character.trait}
            onChange={(e) => setCharacter({...character, trait: e.target.value})}
            placeholder="e.g., Can talk to animals"
            className="w-full p-3.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none transition-all"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="story-input" className="text-sm font-black text-slate-700 uppercase tracking-wide">What is your story about?</label>
        <textarea
          id="story-input"
          value={storyPrompt}
          onChange={(e) => setStoryPrompt(e.target.value)}
          placeholder="e.g., A friendly robot who wants to find the magical singing flower..."
          className={`w-full h-40 p-4 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg leading-relaxed transition-all ${language === 'am' ? 'font-amharic' : ''}`}
          disabled={isLoading}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-4 pt-2">
        <button
          onClick={onSubmit}
          disabled={!isSubmittable}
          className="w-full bg-blue-600 text-white font-extrabold text-2xl py-5 px-8 rounded-2xl hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-slate-300 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-300 ease-in-out shadow-xl disabled:shadow-none grow"
        >
          {isLoading ? 'Creating...' : 'Start My Adventure!'}
        </button>
      </div>
      {!isSubmittable && !isLoading && <p className="text-center text-sm text-slate-500 font-bold">Please fill out all fields to start your story.</p>}
    </div>
  );
};

export default StoryInput;
