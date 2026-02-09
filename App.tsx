
import React, { useState, useCallback, useEffect } from 'react';
import { Page, Character, Language, SavedStory, PageBlueprint, SavedStoryPage } from './types';
import { generateFullStory, generateImage, generateSpeech, cartoonizeImage } from './services/geminiService';
import StoryInput from './components/StoryInput';
import StorybookViewer from './components/StorybookViewer';
import Loader from './components/Loader';
import SavedStories from './components/SavedStories';

// --- Storage Service ---
const STORAGE_KEY = 'ai_storybook_saved_stories';
const QUOTA_LOCKOUT_KEY = 'gemini_quota_lockout_timestamp';
const LOCKOUT_DURATION = 1000 * 60 * 60 * 12; // 12 hours

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
  
  // Try to save with full assets
  try {
    const storiesToSave = [newStory, ...stories];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storiesToSave));
    return newStory;
  } catch (error) {
    // If storage is full, try saving without heavy assets (images/audio)
    console.warn("Storage full, attempting to save without cached assets...");
    
    const strippedPages = newStory.pages.map(p => ({
        pageText: p.pageText,
        imagePrompt: p.imagePrompt,
        animation: p.animation
        // Omit imageUrl and audioData
    }));
    
    const strippedStory = { ...newStory, pages: strippedPages };
    const storiesToSave = [strippedStory, ...stories];
    
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storiesToSave));
        alert("Story saved! However, images and audio could not be saved due to browser storage limits. They will be regenerated when you load the story next time.");
        return strippedStory;
    } catch (finalError) {
        console.error("Failed to save story even without assets:", finalError);
        throw new Error("Could not save the story. The browser's storage is completely full.");
    }
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
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);

  useEffect(() => {
    const lockoutTime = localStorage.getItem(QUOTA_LOCKOUT_KEY);
    if (lockoutTime) {
        const diff = Date.now() - parseInt(lockoutTime, 10);
        if (diff < LOCKOUT_DURATION) {
            setIsQuotaExhausted(true);
        } else {
            localStorage.removeItem(QUOTA_LOCKOUT_KEY); // Expired
        }
    }
  }, []);
  

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
      setView('storybook');
      
      // PHASE 1: Parallel Story Text Generation and Character Style
      setLoadingMessage("Dreaming up the story and styling your hero...");
      
      const storyPromise = generateFullStory(character, language, storyPrompt);
      
      // Robust handling for cartoonize failure: 
      // If cartoonizeImage fails (e.g., safety filter or network), we catch it here
      // and return null so the story can still proceed without the reference image.
      const cartoonPromise = (characterImage && !isQuotaExhausted)
        ? cartoonizeImage(characterImage).catch(err => {
            console.warn("Cartoonization failed:", err);
            const errStr = JSON.stringify(err);
            // Detect 429/Resource Exhausted
            if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
                setIsQuotaExhausted(true);
                localStorage.setItem(QUOTA_LOCKOUT_KEY, Date.now().toString());
                alert("Usage Limit Reached: The daily limit for custom character photos has been hit. \n\nDon't worry! We are continuing to generate your story with our standard colorful illustrations instead. You can try uploading a photo again tomorrow.");
            }
            return null;
          }) 
        : Promise.resolve(null);

      // Run both in parallel
      const [fullStory, cartoonImg] = await Promise.all([storyPromise, cartoonPromise]);
      
      setCartoonizedCharacterImage(cartoonImg);
      setStoryTitle(fullStory.title);
      setStoryBlueprints(fullStory.pages);

      // PHASE 2: Parallel Audio Generation (Low quota usage) but Batched Image Generation (High quota usage)
      setLoadingMessage("Painting the pictures and recording the voice...");
      
      const audioPromises = fullStory.pages.map(p => generateSpeech(p.pageText));
      
      // BATCHED IMAGE GENERATION
      // Processing all images at once hits rate limits (429 errors).
      // We process them in batches of 3 to respect quotas while staying relatively fast.
      const imageUrls = new Array(fullStory.pages.length);
      const BATCH_SIZE = 3;
      
      for (let i = 0; i < fullStory.pages.length; i += BATCH_SIZE) {
        const batch = fullStory.pages.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((p, idx) => {
            const globalIndex = i + idx;
            return generateImage(p.imagePrompt, cartoonImg)
                .then(url => { imageUrls[globalIndex] = url; })
                .catch(e => {
                    console.error(`Failed to generate image for page ${globalIndex + 1}`, e);
                    // Fallback image so story doesn't break completely
                    imageUrls[globalIndex] = "https://placehold.co/600x400/e2e8f0/475569?text=Image+Generation+Failed"; 
                });
        });
        // Wait for this batch to finish before starting the next
        await Promise.all(batchPromises);
      }

      const audioData = await Promise.all(audioPromises);
      
      const finalPages: Page[] = fullStory.pages.map((p, i) => ({
        pageText: p.pageText,
        imageUrl: imageUrls[i] || "https://placehold.co/600x400/e2e8f0/475569?text=No+Image", // Safety fallback
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
  }, [character, language, storyPrompt, characterImage, isQuotaExhausted]);
  
  
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
      // Map pages to include generated assets if they exist
      const pagesToSave: SavedStoryPage[] = storyBlueprints.map((p, i) => ({
        pageText: p.pageText,
        imagePrompt: p.imagePrompt,
        animation: p.animation,
        imageUrl: storyPages[i]?.imageUrl,
        audioData: storyAudio[i]
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
      if (story.characterImage && !isQuotaExhausted) {
        // Try to cartoonize, but tolerate failure on reload too
        try {
            cartoonImg = await cartoonizeImage(story.characterImage);
        } catch (e) {
            console.warn("Failed to re-cartoonize image on load:", e);
            // Proceed without it
        }
        setCartoonizedCharacterImage(cartoonImg);
      }
      
      let imageUrls: string[] = [];
      let audioData: (string | null)[] = [];

      // Check if we have cached assets (all pages have imageUrl)
      const hasCachedAssets = story.pages.every(p => !!p.imageUrl);

      if (hasCachedAssets) {
          console.log("Loading from cache...");
          setLoadingMessage("Restoring your colorful pictures...");
          // Small delay to allow UI to update
          await new Promise(resolve => setTimeout(resolve, 500));
          imageUrls = story.pages.map(p => p.imageUrl!);
          audioData = story.pages.map(p => p.audioData || null);
      } else {
          console.log("Regenerating assets...");
          setLoadingMessage("Redrawing all the pictures...");
          
          // BATCHED REGENERATION for loaded stories too
          const regeneratedImages = new Array(story.pages.length);
          const BATCH_SIZE = 3;
          for (let i = 0; i < story.pages.length; i += BATCH_SIZE) {
             const batch = story.pages.slice(i, i + BATCH_SIZE);
             const batchPromises = batch.map((p, idx) => {
                 const globalIndex = i + idx;
                 return generateImage(p.imagePrompt, cartoonImg)
                    .then(url => { regeneratedImages[globalIndex] = url; })
                    .catch(e => {
                         console.error("Failed to regenerate image", e);
                         regeneratedImages[globalIndex] = "https://placehold.co/600x400/e2e8f0/475569?text=Regeneration+Failed";
                    });
             });
             await Promise.all(batchPromises);
          }
          imageUrls = regeneratedImages;
          audioData = story.pages.map(() => null);
      }

      const finalPages: Page[] = story.pages.map((p, i) => ({
        pageText: p.pageText,
        imageUrl: imageUrls[i],
        animation: p.animation,
      }));

      setStoryPages(finalPages);
      setStoryAudio(audioData);
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
                      Manage Saved Stories
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
                  savedStories={savedStories}
                  onLoadSavedStory={handleLoadStory}
                  isQuotaExhausted={isQuotaExhausted}
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
                storyTitle={storyTitle}
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
