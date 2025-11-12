import React, { useState, useCallback, useEffect } from 'react';
import { Page, Character, Language, SavedStory, PageBlueprint, SavedStoryPage } from './types';
import { generateFullStory, generateImage, generateSpeech, cartoonizeImage } from './services/geminiService';
import StoryInput from './components/StoryInput';
import StorybookViewer from './components/StorybookViewer';
import Loader from './components/Loader';
import SavedStories from './components/SavedStories';

// --- Storage Service ---
const STORAGE_KEY = 'ai_storybook_saved_stories';

function getSavedStories(): SavedStory[] {
  try {
    const storiesJson = localStorage.getItem(STORAGE_KEY);
    return storiesJson ? JSON.parse(storiesJson) : [];
  } catch (error) {
    console.error("Failed to retrieve saved stories:", error);
    return [];
  }
}

function saveStoryToStorage(story: Omit<SavedStory, 'id' | 'createdAt'>): SavedStory {
  const stories = getSavedStories();
  const newStory: SavedStory = {
    ...story,
    id: Date.now().toString(),
    createdAt: Date.now(),
  };
  stories.unshift(newStory);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    return newStory;
  } catch (error) {
    console.error("Failed to save story:", error);
    // This custom error helps differentiate from API errors.
    throw new Error("Could not save the story. The browser's storage might be full.");
  }
}

function deleteStoryFromStorage(storyId: string): void {
  let stories = getSavedStories();
  stories = stories.filter(story => story.id !== storyId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
  } catch (error) {
    console.error("Failed to delete story:", error);
    throw new Error("Could not delete the story.");
  }
}

const Spaceship = () => (
  <svg 
    className="spaceship" 
    aria-hidden="true" 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 100 100"
  >
    <g transform="rotate(25 50 50)">
      {/* Body */}
      <path d="M 50 10 C 30 30, 30 70, 50 90 C 70 70, 70 30, 50 10 Z" fill="#E0E0E0" stroke="#B0B0B0" strokeWidth="2"/>
      {/* Tip */}
      <path d="M 50 10 C 45 20, 55 20, 50 10 Z" fill="#FF4040"/>
      {/* Window */}
      <circle cx="50" cy="40" r="10" fill="#80D8FF" stroke="#404040" strokeWidth="1"/>
      {/* Fins */}
      <path d="M 50 90 L 30 95 L 35 70 Z" fill="#C0C0C0" stroke="#909090" strokeWidth="1"/>
      <path d="M 50 90 L 70 95 L 65 70 Z" fill="#C0C0C0" stroke="#909090" strokeWidth="1"/>
      {/* Flame */}
      <path d="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" fill="orange">
          <animate attributeName="d" values="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z; M 40 90 C 45 110, 55 110, 60 90 C 55 100, 45 100, 40 90 Z; M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" dur="0.5s" repeatCount="indefinite" />
      </path>
    </g>
  </svg>
);

function App() {
  const [view, setView] = useState<'input' | 'storybook' | 'saved'>('input');
  
  // Story Creation State
  const [character, setCharacter] = useState<Character>({ name: '', appearance: '', trait: '' });
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [cartoonizedCharacterImage, setCartoonizedCharacterImage] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBlueprints, setStoryBlueprints] = useState<PageBlueprint[]>([]);
  
  // Story Viewer State
  const [storyPages, setStoryPages] = useState<Page[]>([]);
  const [storyAudio, setStoryAudio] = useState<(string | null)[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isViewingSaved, setIsViewingSaved] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null); // Key for re-rendering viewer
  
  // App-wide State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initialize state directly from localStorage to prevent UI flicker
  const [savedStories, setSavedStories] = useState<SavedStory[]>(() => getSavedStories());
  const [loadingMessage, setLoadingMessage] = useState('');
  

  const handleStartStory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStoryPages([]);
    setStoryAudio([]);
    setStoryTitle('');
    setStoryBlueprints([]);
    setIsSaved(false);
    setIsViewingSaved(false);
    setCartoonizedCharacterImage(null);
    setStoryId(null);

    try {
      setLoadingMessage("Getting your hero ready...");
      let cartoonImg = null;
      if (characterImage) {
        cartoonImg = await cartoonizeImage(characterImage);
        setCartoonizedCharacterImage(cartoonImg);
      }

      setView('storybook');

      setLoadingMessage("Writing a grand adventure...");
      const fullStory = await generateFullStory(character, language, storyPrompt);
      setStoryTitle(fullStory.title);
      setStoryBlueprints(fullStory.pages);

      setLoadingMessage("Drawing all the pictures...");
      const imagePromises = fullStory.pages.map(p => generateImage(p.imagePrompt, cartoonImg));
      const imageUrls = await Promise.all(imagePromises);

      setLoadingMessage("Recording the narrator's voice...");
      const audioPromises = fullStory.pages.map(p => generateSpeech(p.pageText));
      const audioData = await Promise.all(audioPromises);
      
      const finalPages: Page[] = fullStory.pages.map((p, i) => ({
        pageText: p.pageText,
        imageUrl: imageUrls[i],
        animation: p.animation,
      }));

      setStoryPages(finalPages);
      setStoryAudio(audioData.map(a => a ? `data:audio/webm;base64,${a}` : null));
      setStoryId(Date.now().toString()); // Set unique key to force remount
      
    } catch (e) {
      if (e instanceof Error) { setError(e.message); } 
      else { setError('An unknown error occurred.'); }
      setView('input');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [character, language, storyPrompt, characterImage]);
  
  
  const handleExitToMenu = () => {
    setCharacter({ name: '', appearance: '', trait: '' });
    setCharacterImage(null);
    setCartoonizedCharacterImage(null);
    setStoryPrompt('');
    setStoryTitle('');
    setStoryBlueprints([]);
    setStoryPages([]);
    setStoryAudio([]);
    setIsLoading(false);
    setError(null);
    setIsViewingSaved(false);
    setIsSaved(false);
    setStoryId(null);
    setView('input');
  };

  const handleSaveStory = () => {
    if (!storyTitle || storyBlueprints.length === 0) {
        setError("Cannot save an incomplete story.");
        return;
    }
    try {
      const pagesToSave: SavedStoryPage[] = storyBlueprints.map(p => ({
        pageText: p.pageText,
        imagePrompt: p.imagePrompt,
        animation: p.animation,
      }));

      saveStoryToStorage({
        title: storyTitle,
        character,
        characterImage,
        pages: pagesToSave,
        language: language,
      });
      // Update state directly from the source of truth
      setSavedStories(getSavedStories());
      setIsSaved(true);
    } catch (e) {
      if (e instanceof Error) { setError(e.message); }
      else { setError("Failed to save the story."); }
    }
  };

  const handleDeleteStory = (id: string) => {
      try {
        deleteStoryFromStorage(id);
        // Update state directly from the source of truth
        setSavedStories(getSavedStories());
      } catch(e) {
        if (e instanceof Error) { setError(e.message); }
        else { setError("Failed to delete story."); }
      }
  };

  const handleLoadStory = async (story: SavedStory) => {
    setIsLoading(true);
    setError(null);
    setLoadingMessage("Rebuilding your adventure...");
    
    // Reset all story-related state to prevent old data from persisting
    setStoryPages([]);
    setStoryAudio([]);
    setStoryBlueprints([]);
    setIsSaved(false);
    setIsViewingSaved(false);
    setCartoonizedCharacterImage(null);
    setStoryId(null); // Clear key before loading

    // Set the character and story details for the new story
    setCharacter(story.character);
    setCharacterImage(story.characterImage);
    setLanguage(story.language || 'en');
    setStoryTitle(story.title);
    
    const blueprints: PageBlueprint[] = story.pages.map(p => ({
        pageText: p.pageText,
        imagePrompt: p.imagePrompt,
        animation: p.animation,
    }));
    setStoryBlueprints(blueprints);
    
    setView('storybook');

    try {
      setLoadingMessage("Warming up the hero...");
      let cartoonImg = null;
      if (story.characterImage) {
        cartoonImg = await cartoonizeImage(story.characterImage);
        setCartoonizedCharacterImage(cartoonImg);
      }
      
      setLoadingMessage("Redrawing all the pictures...");
      const imagePromises = story.pages.map(p => generateImage(p.imagePrompt, cartoonImg));
      const imageUrls = await Promise.all(imagePromises);

      const finalPages: Page[] = story.pages.map((p, i) => ({
        pageText: p.pageText,
        imageUrl: imageUrls[i],
        animation: p.animation,
      }));

      setStoryPages(finalPages);
      // Saved stories generate audio on-demand, so initialize with null
      setStoryAudio(finalPages.map(() => null));
      setIsViewingSaved(true);
      setIsSaved(true);
      setStoryId(story.id); // Set the key from the saved story to force remount

    } catch (e) {
      if (e instanceof Error) { setError(e.message); } 
      else { setError('An unknown error occurred while reloading the story.'); }
      setView('input');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };
  
  const isHomeScreen = view === 'input' || view === 'saved';

  return (
    <>
      <div id="space-container" aria-hidden="true">
        <div id="stars1" className="stars" />
        <div id="stars2" className="stars" />
        <div id="stars3" className="stars" />
      </div>

      {isHomeScreen && <Spaceship />}

      <div className={`relative z-10 min-h-screen font-sans p-4 sm:p-6 lg:p-8 transition-colors duration-500 ${isHomeScreen ? 'bg-transparent' : 'bg-slate-100'}`}>
        <header className="text-center mb-8">
          <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold transition-colors duration-500 ${isHomeScreen ? 'text-white' : 'text-slate-800'}`}>
            AI Storybook Generator
          </h1>
          <p className={`mt-2 text-lg max-w-2xl mx-auto transition-colors duration-500 ${isHomeScreen ? 'text-slate-300' : 'text-slate-600'}`}>
            Create a personalized, illustrated, and narrated story for your child in minutes!
          </p>
          {isHomeScreen && (
            <div className="mt-6">
              {view === 'input' && savedStories.length > 0 && (
                  <button 
                      onClick={() => setView('saved')}
                      className="bg-white text-slate-800 font-bold py-2 px-6 rounded-lg shadow-md hover:bg-slate-200 transition-all"
                  >
                      My Saved Stories
                  </button>
              )}
              {view === 'saved' && (
                  <button 
                      onClick={() => setView('input')}
                      className="bg-white text-slate-800 font-bold py-2 px-6 rounded-lg shadow-md hover:bg-slate-200 transition-all"
                  >
                      Create New Story
                  </button>
              )}
            </div>
          )}
        </header>

        <main className="container mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <strong className="font-bold">Oh no! </strong>
              <span className="block sm:inline">{error}</span>
              <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                <span className="text-2xl" aria-hidden="true">&times;</span>
              </button>
            </div>
          )}

          <div className="flex justify-center">
            {view === 'input' && (
                <StoryInput
                  character={character}
                  setCharacter={setCharacter}
                  characterImage={characterImage}
                  setCharacterImage={setCharacterImage}
                  language={language}
                  setLanguage={setLanguage}
                  storyPrompt={storyPrompt}
                  setStoryPrompt={setStoryPrompt}
                  onSubmit={handleStartStory}
                  isLoading={isLoading}
                />
            )}
            {view === 'saved' && (
                <SavedStories 
                    stories={savedStories}
                    onLoad={handleLoadStory}
                    onDelete={handleDeleteStory}
                />
            )}
            {view === 'storybook' && isLoading && (
                <Loader message={loadingMessage} />
            )}
            {view === 'storybook' && !isLoading && storyPages.length > 0 && storyId && (
              <StorybookViewer
                key={storyId}
                pages={storyPages}
                pageAudio={storyAudio}
                onExit={handleExitToMenu}
                onSaveStory={handleSaveStory}
                language={language}
                isViewingSaved={isViewingSaved}
                isSaved={isSaved}
              />
            )}
          </div>
        </main>
        <footer className={`text-center mt-8 transition-colors duration-500 ${isHomeScreen ? 'text-slate-400' : 'text-slate-500'}`}>
          <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </>
  );
}

export default App;