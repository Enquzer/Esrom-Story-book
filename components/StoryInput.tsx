
import React from 'react';
import { Language, Character, SavedStory } from '../types';

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
  onLoadSavedStory
}) => {
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCharacterImage(reader.result as string);
        setCharacter({ ...character, appearance: 'Based on the uploaded picture' });
      };
      reader.readAsDataURL(file);
    }
  };
  
  const removeImage = () => {
      setCharacterImage(null);
      setCharacter({ ...character, appearance: '' });
  };

  const isSubmittable = !isLoading && storyPrompt.trim().length >= 10 && character.name.trim().length > 0 && (character.appearance.trim().length > 0 || characterImage) && character.trait.trim().length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 relative">
      
      {/* Saved Stories Dropdown */}
      {savedStories.length > 0 && (
        <div className="absolute top-6 right-6 z-10">
            <select 
                onChange={(e) => {
                    const story = savedStories.find(s => s.id === e.target.value);
                    if (story) onLoadSavedStory(story);
                    e.target.value = ""; // Reset selection
                }}
                disabled={isLoading}
                className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-bold cursor-pointer hover:bg-blue-100 transition-colors"
                defaultValue=""
            >
                <option value="" disabled>📂 Load a saved story...</option>
                {savedStories.map(story => (
                    <option key={story.id} value={story.id}>
                        {story.title} ({story.character.name})
                    </option>
                ))}
            </select>
        </div>
      )}

      <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-800 tracking-tight mt-4">Create Your Hero's Adventure!</h2>
      
       <div className="space-y-4 p-4 border-2 border-dashed rounded-lg text-center">
        {!characterImage ? (
          <>
            <label htmlFor="image-upload" className="font-bold text-slate-600 cursor-pointer text-blue-600 hover:text-blue-800">
              Upload a Picture of Your Hero! (Optional)
            </label>
            <p className="text-xs text-slate-500">Make your hero the star of the story!</p>
            <input
              id="image-upload"
              type="file"
              accept="image/png, image/jpeg"
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
          <label htmlFor="character-name" className="text-sm font-bold text-slate-600">Hero's Name</label>
          <input
            id="character-name"
            type="text"
            value={character.name}
            onChange={(e) => setCharacter({...character, name: e.target.value})}
            placeholder="e.g., Leo the Brave"
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="language-select" className="text-sm font-bold text-slate-600">Story Language</label>
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
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="character-appearance" className="text-sm font-bold text-slate-600">Hero's Look</label>
          <input
            id="character-appearance"
            type="text"
            value={character.appearance}
            onChange={(e) => setCharacter({...character, appearance: e.target.value})}
            placeholder="e.g., Spiky red hair and a blue cape"
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            disabled={isLoading || !!characterImage}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="character-trait" className="text-sm font-bold text-slate-600">Special Power or Trait</label>
          <input
            id="character-trait"
            type="text"
            value={character.trait}
            onChange={(e) => setCharacter({...character, trait: e.target.value})}
            placeholder="e.g., Can talk to animals"
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="story-input" className="text-sm font-bold text-slate-600">What is your story about?</label>
        <textarea
          id="story-input"
          value={storyPrompt}
          onChange={(e) => setStoryPrompt(e.target.value)}
          placeholder="e.g., A friendly robot who wants to find the magical singing flower..."
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
          {isLoading ? 'Creating...' : 'Start My Adventure!'}
        </button>
      </div>
      {!isSubmittable && !isLoading && <p className="text-center text-sm text-slate-500">Please fill out all fields to start your story.</p>}
    </div>
  );
};

export default StoryInput;
