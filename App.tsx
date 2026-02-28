import React, { useState, useCallback, useEffect } from 'react';
import { Page, Character, Language, SavedStory, PageBlueprint, SavedStoryPage } from './types';
import { generateFullStory, cartoonizeImage, getCredits } from './services/geminiService';
import { translations } from './translations';
import { saveStoryToSupabase, getUserStories, getStoryById } from './services/supabaseService';
import { supabase } from './services/supabaseClient';
import { User } from '@supabase/supabase-js';
import Auth from './components/Auth';
import SpaceshipGame from './components/SpaceshipGame';
import StoryInput from './components/StoryInput';
import StorybookViewer from './components/StorybookViewer';
import Loader from './components/Loader';
import SavedStories from './components/SavedStories';

const STORAGE_KEY = 'ai_storybook_saved_stories';
const QUOTA_LOCKOUT_KEY = 'gemini_quota_lockout_timestamp';
const LOCKOUT_DURATION = 1000 * 60 * 60 * 12;

function getSavedStories(): SavedStory[] {
  try {
    const storiesJson = localStorage.getItem(STORAGE_KEY);
    return storiesJson ? JSON.parse(storiesJson) : [];
  } catch (error) { return []; }
}

function saveStoryToStorage(story: Omit<SavedStory, 'id' | 'createdAt'>): SavedStory {
  const stories = getSavedStories();
  const newStory: SavedStory = { ...story, id: Date.now().toString(), createdAt: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([newStory, ...stories]));
    return newStory;
  } catch (error) {
    const strippedPages = newStory.pages.map(p => ({ pageText: p.pageText, imagePrompt: p.imagePrompt, animation: p.animation }));
    const strippedStory = { ...newStory, pages: strippedPages };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([strippedStory, ...stories]));
    alert("Story saved text-only due to storage limits.");
    return strippedStory;
  }
}

function deleteStoryFromStorage(storyId: string): void {
  const stories = getSavedStories().filter(s => s.id !== storyId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
}

const Spaceship = () => (
  <svg className="spaceship" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <g transform="rotate(25 50 50)">
      <path d="M 50 10 C 30 30, 30 70, 50 90 C 70 70, 70 30, 50 10 Z" fill="#E0E0E0" stroke="#B0B0B0" strokeWidth="2"/>
      <circle cx="50" cy="40" r="10" fill="#80D8FF" stroke="#404040" strokeWidth="1"/>
      <path d="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" fill="orange">
          <animate attributeName="d" values="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z; M 40 90 C 45 110, 55 110, 60 90 C 55 100, 45 100, 40 90 Z; M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" dur="0.5s" repeatCount="indefinite" />
      </path>
    </g>
  </svg>
);

async function compressImage(base64: string, maxWidth = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.7));
    };
    img.onerror = () => resolve(base64);
  });
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'input' | 'storybook' | 'saved'>('input');
  const [character, setCharacter] = useState<Character>({ name: '', appearance: '', trait: '' });
  const [characterImage, setCharacterImage] = useState<string | null>(null);
  const [cartoonizedCharacterImage, setCartoonizedCharacterImage] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [storyPrompt, setStoryPrompt] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBlueprints, setStoryBlueprints] = useState<PageBlueprint[]>([]);
  const [storyPages, setStoryPages] = useState<Page[]>([]);
  const [storyAudio, setStoryAudio] = useState<(string | null)[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isViewingSaved, setIsViewingSaved] = useState(false);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedStories, setSavedStories] = useState<SavedStory[]>(() => getSavedStories());
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false);
  const [isGeminiQuotaExhausted, setIsGeminiQuotaExhausted] = useState(false);
  const [withImages, setWithImages] = useState(true);
  const [credits, setCredits] = useState<{ amount: number; date: string } | null>(null);
  const [showGame, setShowGame] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const data = await getCredits();
      setCredits(data);
      if (data.amount <= 0) setIsQuotaExhausted(true);
      else setIsQuotaExhausted(false);
    } catch (e) { console.error("Failed to fetch credits", e); }
  }, []);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  const handleStartStory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setView('storybook');
    setLoadingMessage(t.summoningAdventure);
    
    try {
      const fullStory = await generateFullStory(character, language, storyPrompt);
      setStoryTitle(fullStory.title);
      setStoryBlueprints(fullStory.pages);

      let cartoonImg: string | null = null;
      if (withImages && characterImage) {
        setLoadingMessage(t.transformingPhoto);
        try {
          cartoonImg = await cartoonizeImage(characterImage);
          setCartoonizedCharacterImage(cartoonImg);
        } catch (err: any) {
          console.error("Cartoonize error:", err);
        }
      }

      // In On-Demand mode, we don't generate images/audio here.
      // We just set the pages with the text and prompts.
      const finalPages: Page[] = fullStory.pages.map((blueprint, i) => ({
        pageText: blueprint.pageText,
        imageUrl: '', // Will be generated on demand
        imagePrompt: blueprint.imagePrompt,
        animation: blueprint.animation,
      }));

      setStoryPages(finalPages);
      setStoryAudio(new Array(finalPages.length).fill(null));
      setStoryId(Date.now().toString());
      setIsSaved(false);
      refreshCredits();
    } catch (e: any) {
      console.error("Critical story error:", e);
      if (e.message === 'QUOTA_EXHAUSTED' || e.message?.includes('429') || e.message?.includes('503')) {
        setIsGeminiQuotaExhausted(true);
        setError("You've reached your daily magic limit for today! Please try again tomorrow, or wait a few moments if it's just a busy spike.");
      } else {
        setError(e.message || t.magicSlow);
      }
      setView('input');
    } finally {
      setIsLoading(false);
    }
  }, [character, language, storyPrompt, characterImage, withImages, refreshCredits]);

  const handleExitToMenu = () => {
    setView('input');
    setStoryPages([]);
    setIsViewingSaved(false);
    setStoryId(null);
  };

  const handleLoadStory = async (story: SavedStory) => {
    setIsLoading(true);
    setError(null);
    setStoryTitle(story.title);
    setLanguage(story.language || 'en');
    setCharacter(story.character || { name: '', appearance: '', trait: '' });
    setView('storybook');
    setLoadingMessage(t.restoringJourney);

    try {
      // Try to load from Supabase if it's a Supabase story
      let pages = story.pages.map(p => ({ 
        pageText: p.pageText, 
        imageUrl: p.imageUrl || "https://placehold.co/600x400?text=Image+Not+Found", 
        animation: p.animation 
      }));
      let audio = story.pages.map(p => p.audioData || null);

      if (story.id && !story.id.includes('-')) {
        // Local story
      } else if (story.id) {
        // Supabase story
        const dbStory = await getStoryById(story.id);
        if (dbStory && dbStory.pages) {
          pages = dbStory.pages.map((p: any) => ({
            pageText: p.content,
            imageUrl: p.image_url || "https://placehold.co/600x400?text=Image+Not+Found",
            animation: 'fade'
          }));
          audio = new Array(pages.length).fill(null);
        }
      }

      setStoryPages(pages);
      setStoryAudio(audio);
      setIsViewingSaved(true);
      setIsSaved(true);
      setStoryId(story.id);
    } catch (e) { 
      setError(t.failedLoadAdventure); 
      setView('input'); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const loadSavedStories = async () => {
    try {
      const localStories = getSavedStories();
      if (user) {
        const dbStories = await getUserStories();
        const formattedDbStories: SavedStory[] = dbStories.map(s => ({
          id: s.id,
          createdAt: new Date(s.created_at).getTime(),
          title: s.title,
          character: { name: '', appearance: '', trait: '' },
          characterImage: s.cover_url || null,
          language: 'en',
          pages: [] // Pages are loaded on demand
        }));
        setSavedStories([...formattedDbStories, ...localStories]);
      } else {
        setSavedStories(localStories);
      }
    } catch (e) {
      console.error("Failed to load stories", e);
      setSavedStories(getSavedStories());
    }
  };

  useEffect(() => {
    loadSavedStories();
  }, [user]);

  const isHomeScreen = view === 'input' || view === 'saved';
  const t = translations[language];

  if (!user) {
    return <Auth />;
  }

  return (
    <>
      <div id="space-container" aria-hidden="true">
        <div id="stars1" className="stars" />
        <div id="stars2" className="stars" />
        <div id="stars3" className="stars" />
      </div>
      {isHomeScreen && <Spaceship />}
      <div className={`relative z-10 min-h-screen p-4 transition-colors duration-500 ${isHomeScreen ? 'bg-transparent' : 'bg-slate-100'}`}>
        <header className="text-center mb-8 flex flex-col items-center no-print">
          <div className="w-full max-w-lg mb-4 drop-shadow-2xl">
            <img 
              src="/logo.png" 
              alt="StorySpark Logo" 
              className="w-full h-auto object-contain"
            />
            
            {/* Background elements for the welcome screen */}
            {isHomeScreen && (
              <div className="absolute inset-0 -z-10 pointer-events-none opacity-40">
                <div id="planet1" className="absolute top-10 right-10 w-24 h-24 bg-linear-to-br from-orange-400 to-red-600 rounded-full blur-[1px] shadow-lg animate-pulse" />
                <div id="planet2" className="absolute bottom-20 left-20 w-16 h-16 bg-linear-to-br from-blue-400 to-indigo-600 rounded-full blur-[1px]" />
                <div id="planet3" className="absolute top-1/2 left-10 w-32 h-32 bg-linear-to-br from-green-300 to-teal-500 rounded-full blur-[1px] opacity-20" />
              </div>
            )}
          </div>
          {isHomeScreen && (
            <div className="mt-4 flex flex-col items-center gap-4">
              {credits && (
                <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1 rounded-full text-white text-sm font-bold">
                  ✨ {credits.amount} {t.creditsLeft}
                </div>
              )}
              <div className="flex justify-center gap-4">
                <button onClick={() => setView(view === 'input' ? 'saved' : 'input')} className="bg-white/20 backdrop-blur-md border border-white/30 text-white font-bold py-2 px-6 rounded-full hover:bg-white/30 transition-all">
                  {view === 'input' ? `📚 ${t.library}` : `✍️ ${t.create}`}
                </button>
                <button 
                  onClick={() => supabase.auth.signOut()} 
                  className="bg-red-500/20 backdrop-blur-md border border-red-500/30 text-white font-bold py-2 px-6 rounded-full hover:bg-red-500/40 transition-all"
                >
                  🚪 Logout
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="container mx-auto max-w-6xl">
          {/* Custom Quota Exhausted Popup */}
          {error && (error.includes('magic limit') || error.includes('quota')) ? (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-[40px] shadow-2xl max-w-md w-full text-center border-4 border-blue-100 animate-in zoom-in duration-300">
                    <div className="text-6xl mb-4">🚀</div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">{t.magicLimitReached}</h2>
                    <p className="text-slate-600 mb-8">{error}</p>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => { setError(null); setView('saved'); }}
                            className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-lg"
                        >
                            📚 {t.library}
                        </button>
                        <button 
                            onClick={() => { setShowGame(true); setError(null); }}
                            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg"
                        >
                            🎮 {t.playGame}
                        </button>
                        <button 
                            onClick={() => setError(null)}
                            className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-all"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
          ) : error ? (
            <div className="bg-red-500 text-white p-4 rounded-xl mb-6 font-bold shadow-lg animate-bounce no-print">{error}</div>
          ) : null}
          
          {showGame && <SpaceshipGame onBack={() => setShowGame(false)} language={language} />}
          <div className="flex justify-center">
            {view === 'input' && (
              <StoryInput 
                character={character} setCharacter={setCharacter} 
                characterImage={characterImage} setCharacterImage={setCharacterImage} 
                language={language} setLanguage={setLanguage} 
                storyPrompt={storyPrompt} setStoryPrompt={setStoryPrompt} 
                onSubmit={handleStartStory} isLoading={isLoading} 
                savedStories={savedStories} onLoadSavedStory={handleLoadStory} 
                isQuotaExhausted={isQuotaExhausted || isGeminiQuotaExhausted}
                withImages={withImages} setWithImages={setWithImages}
                onPlayGame={() => setShowGame(true)}
              />
            )}
            {view === 'saved' && (
              <SavedStories 
                stories={savedStories} 
                onLoad={handleLoadStory} 
                onDelete={(id) => { deleteStoryFromStorage(id); setSavedStories(getSavedStories()); }} 
                language={language}
                onHome={() => setView('input')}
              />
            )}
            {view === 'storybook' && isLoading && <Loader message={loadingMessage} language={language} />}
            {view === 'storybook' && !isLoading && storyPages.length > 0 && storyId && (
              <StorybookViewer 
                key={storyId} pages={storyPages} pageAudio={storyAudio} 
                onExit={handleExitToMenu} 
                character={character}
                characterImage={cartoonizedCharacterImage}
                onSaveStory={async () => { 
                  try {
                    setLoadingMessage("Saving to cloud...");
                    setIsLoading(true);
                    if (user) {
                      await saveStoryToSupabase(storyTitle, character.trait || 'Adventure', storyPages, cartoonizedCharacterImage || undefined);
                      alert("Story saved to cloud successfully!");
                    } else {
                      // Fallback to local storage
                      const compressedPages = await Promise.all(storyPages.map(async (p, i) => ({
                        ...p,
                        imageUrl: p.imageUrl ? await compressImage(p.imageUrl) : '',
                        audioData: storyAudio[i]
                      })));
                      saveStoryToStorage({ 
                        title: storyTitle, character, characterImage, 
                        pages: compressedPages, 
                        language 
                      }); 
                      alert("Story saved locally!");
                    }
                    setIsSaved(true); 
                    loadSavedStories();
                  } catch (e: any) {
                    console.error("Save error:", e);
                    alert("Failed to save story: " + e.message);
                  } finally {
                    setIsLoading(false);
                  }
                }} 
                language={language} isViewingSaved={isViewingSaved} 
                isSaved={isSaved} storyTitle={storyTitle} 
                onCreditsUpdate={refreshCredits}
              />
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export default App;