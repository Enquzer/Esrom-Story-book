
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
  savedStories: SavedStory[];
  onLoadSavedStory: (story: SavedStory) => void;
  isQuotaExhausted: boolean;
  withImages: boolean;
  setWithImages: (val: boolean) => void;
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
  savedStories,
  onLoadSavedStory,
  isQuotaExhausted,
  withImages,
  setWithImages
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

  const isSubmittable = !isLoading && storyPrompt.trim().length >= 10 && character.name.trim().length > 0 && (character.appearance.trim().length > 0 || characterImage) && character.trait.trim().length > 0;
  const t = translations[language];

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 relative">
      
      {savedStories.length > 0 && (
        <div className="absolute top-6 right-6 z-10">
            <select 
                onChange={(e) => {
                    const story = savedStories.find(s => s.id === e.target.value);
                    if (story) onLoadSavedStory(story);
                    e.target.value = "";
                }}
                disabled={isLoading}
                className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-bold cursor-pointer hover:bg-blue-100 transition-colors"
                defaultValue=""
            >
                <option value="" disabled>📂 {t.loadSaved}</option>
                {savedStories.map(story => (
                    <option key={story.id} value={story.id}>
                        {story.title} ({story.character.name})
                    </option>
                ))}
            </select>
        </div>
      )}

      <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-800 tracking-tight mt-4">{t.createAdventure}</h2>
      
      <div className="space-y-4 p-4 border-2 border-dashed rounded-lg text-center bg-slate-50/50">
        {isQuotaExhausted ? (
            <div className="flex flex-col items-center justify-center text-amber-700 bg-amber-50 p-4 rounded">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                 </svg>
                 <p className="font-bold text-sm">{t.limitReached}</p>
                 <p className="text-xs mt-1 max-w-xs">
                     {t.limitMessage}
                 </p>
            </div>
        ) : !characterImage ? (
          <>
            <label htmlFor="image-upload" className="font-bold text-slate-600 cursor-pointer text-blue-600 hover:text-blue-800">
              {t.uploadPhoto}
            </label>
            <p className="text-xs text-slate-500">{t.starOfStory}</p>
            <input
              id="image-upload"
              type="file"
              accept="image/png, image/jpeg, image/jpg"
              onChange={handleImageUpload}
              className="hidden"
              disabled={isLoading}
            />
          </>
        ) : (
          <div className="relative inline-block">
            <img src={characterImage} alt="Character preview" className="w-32 h-32 object-cover rounded-lg shadow-md mx-auto" />
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 leading-none shadow-lg hover:bg-red-600"
              aria-label="Remove image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="character-name" className="text-sm font-bold text-slate-600">{t.heroName}</label>
          <input
            id="character-name"
            type="text"
            value={character.name}
            onChange={(e) => setCharacter({...character, name: e.target.value})}
            placeholder={t.leoTheBrave}
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="language-select" className="text-sm font-bold text-slate-600">{t.storyLanguage}</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="en">English</option>
            <option value="am">Amharic (አማርኛ)</option>
          </select>
        </div>
      </div>

      {/* Generation Mode Toggle */}
      <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between border border-blue-100">
        <div>
          <p className="font-bold text-blue-800 flex items-center gap-2">
            {withImages ? `✨ ${t.fullPictureBook}` : `📖 ${t.narratedTextOnly}`}
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            {withImages ? t.usesMoreEnergy : t.fasterGeneration}
          </p>
        </div>
        <button 
          onClick={() => setWithImages(!withImages)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${withImages ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${withImages ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="character-appearance" className="text-sm font-bold text-slate-600">{t.heroLook}</label>
          <input
            id="character-appearance"
            type="text"
            value={character.appearance}
            onChange={(e) => setCharacter({...character, appearance: e.target.value})}
            placeholder={t.spikyHair}
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            disabled={isLoading || !!characterImage}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="character-trait" className="text-sm font-bold text-slate-600">{t.specialTrait}</label>
          <input
            id="character-trait"
            type="text"
            value={character.trait}
            onChange={(e) => setCharacter({...character, trait: e.target.value})}
            placeholder={t.talkToAnimals}
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="story-input" className="text-sm font-bold text-slate-600">{t.storyAbout}</label>
        <textarea
          id="story-input"
          value={storyPrompt}
          onChange={(e) => setStoryPrompt(e.target.value)}
          placeholder={t.robotPrompt}
          className={`w-full h-40 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg leading-relaxed ${language === 'am' ? 'font-amharic' : ''}`}
          disabled={isLoading}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onSubmit}
          disabled={!isSubmittable}
          className="w-full bg-blue-600 text-white font-bold text-xl py-4 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300 ease-in-out shadow-lg disabled:shadow-none flex-grow"
        >
          {isLoading ? t.creating : t.startAdventure}
        </button>
      </div>
      {!isSubmittable && !isLoading && <p className="text-center text-sm text-slate-500">{t.fillAllFields}</p>}
    </div>
  );
};

export default StoryInput;
