import React, { useState, useCallback, useEffect } from 'react';
import { Page, Character, Language, SavedStory, PageBlueprint } from './types';
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
  const [activeGame, setActiveGame] = useState<'none' | 'spaceship' | 'basketball' | 'protect'>('none');

  const t = translations[language];

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
      const email = user?.email || 'guest';
      const data = await getCredits(email);
      setCredits(data);
      if (data.amount <= 0) setIsQuotaExhausted(true);
      else setIsQuotaExhausted(false);
    } catch (e) { console.error("Failed to fetch credits", e); }
  }, [user]);

  useEffect(() => {
    if (user) refreshCredits();
  }, [user, refreshCredits]);

  const handleStartStory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLoadingMessage(t.summoningAdventure);
    
    try {
      const email = user?.email || 'guest';
      const fullStory = await generateFullStory(character, language, storyPrompt, email);
      
      setStoryTitle(fullStory.title);
      
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

      const finalPages: Page[] = fullStory.pages.map((blueprint: any) => ({
        pageText: blueprint.pageText,
        imageUrl: '',
        imagePrompt: blueprint.imagePrompt,
        animation: blueprint.animation,
      }));

      setStoryPages(finalPages);
      setStoryAudio(new Array(finalPages.length).fill(null));
      setStoryId(Date.now().toString());
      setIsSaved(false);
      setView('storybook');
      refreshCredits();

    } catch (err: any) {
      console.error("Story generation failed:", err);
      if (err.message?.includes('429') || err.message?.includes('quota')) {
        setIsGeminiQuotaExhausted(true);
      } else {
        alert("Failed to generate story: " + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [character, language, storyPrompt, characterImage, withImages, refreshCredits, user, t]);

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
    setLoadingMessage(t.restoringJourney);

    try {
      let pages = story.pages.map(p => ({ 
        pageText: p.pageText, 
        imageUrl: p.imageUrl || "https://placehold.co/600x400?text=Image+Not+Found", 
        animation: p.animation 
      }));
      let audio = story.pages.map(p => p.audioData || null);

      if (story.id && story.id.includes('-')) {
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
      setView('storybook');
    } catch (e) { 
      alert(t.failedLoadAdventure); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const loadSavedStories = useCallback(async () => {
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
          pages: [] 
        }));
        setSavedStories([...formattedDbStories, ...localStories]);
      } else {
        setSavedStories(localStories);
      }
    } catch (e) {
      setSavedStories(getSavedStories());
    }
  }, [user]);

  useEffect(() => {
    loadSavedStories();
  }, [loadSavedStories]);

  const isHomeScreen = view === 'input' || view === 'saved';

  if (!user) return <Auth />;

  return (
    <>
      <div id="space-container" aria-hidden="true" className="fixed inset-0 pointer-events-none">
        <div id="stars1" className="stars" />
        <div id="stars2" className="stars" />
        <div id="stars3" className="stars" />
      </div>

      {(isQuotaExhausted || isGeminiQuotaExhausted) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border-2 border-purple-500/50 rounded-3xl p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(168,85,247,0.3)]">
            <div className="text-6xl mb-4 animate-bounce">✨</div>
            <h2 className="text-2xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">Engine's Napping!</h2>
            <p className="text-slate-400 mb-6 text-sm">Our story engine is taking a quick break to restore its magic. Try your library or play a game!</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setIsQuotaExhausted(false); setIsGeminiQuotaExhausted(false); setView('saved'); }} className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold transition-all">📚 Visit Library</button>
              <button onClick={() => { setIsQuotaExhausted(false); setIsGeminiQuotaExhausted(false); setActiveGame('spaceship'); }} className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-all border border-slate-700">🚀 Play Spaceship</button>
              <button onClick={() => { setIsQuotaExhausted(false); setIsGeminiQuotaExhausted(false); }} className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {isHomeScreen && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50"><Spaceship /></div>}

      <div className={`relative z-10 min-h-screen transition-colors duration-500 ${isHomeScreen ? 'bg-transparent' : 'bg-slate-50'}`}>
        <header className="p-4 flex flex-col items-center gap-4">
          <img src="/logo.png" alt="Logo" className="w-full max-w-[300px] drop-shadow-2xl" />
          {isHomeScreen && (
            <div className="flex flex-col items-center gap-3">
              {credits && <div className="bg-white/10 backdrop-blur-md px-4 py-1 rounded-full text-white text-sm font-bold">✨ {credits.amount} Credits</div>}
              <div className="flex gap-4">
                <button onClick={() => setView(view === 'input' ? 'saved' : 'input')} className="bg-white/20 backdrop-blur-md border border-white/30 text-white font-bold py-2 px-6 rounded-full hover:bg-white/30">
                  {view === 'input' ? '📚 Library' : '✍️ Create'}
                </button>
                <button onClick={() => supabase.auth.signOut()} className="bg-red-500/20 backdrop-blur-md border border-red-500/30 text-white font-bold py-2 px-6 rounded-full hover:bg-red-500/40">🚪 Logout</button>
              </div>
            </div>
          )}
        </header>

        <main className="container mx-auto px-4 py-8">
          {activeGame === 'spaceship' && <SpaceshipGame onBack={() => setActiveGame('none')} language={language} />}
          {activeGame === 'basketball' && (
            <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4">
              <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden flex flex-col aspect-400/600">
                <div className="bg-slate-800 p-2 flex justify-between items-center px-4"><span className="text-white font-bold text-xs">🏀 Basketball</span><button onClick={() => setActiveGame('none')} className="text-white font-black">X</button></div>
                <iframe src="/basketball/index.html" className="grow w-full border-none" />
              </div>
            </div>
          )}
          {activeGame === 'protect' && (
            <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4">
              <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden flex flex-col aspect-400/600">
                <div className="bg-slate-800 p-2 flex justify-between items-center px-4"><span className="text-white font-bold text-xs">🛡️ Protect</span><button onClick={() => setActiveGame('none')} className="text-white font-black">X</button></div>
                <iframe src="/protect/index.html" className="grow w-full border-none" />
              </div>
            </div>
          )}

          {view === 'input' && !isLoading && (
            <StoryInput character={character} setCharacter={setCharacter} characterImage={characterImage} setCharacterImage={setCharacterImage} language={language} setLanguage={setLanguage} storyPrompt={storyPrompt} setStoryPrompt={setStoryPrompt} onSubmit={handleStartStory} isLoading={isLoading} savedStories={savedStories} onLoadSavedStory={handleLoadStory} isQuotaExhausted={isQuotaExhausted || isGeminiQuotaExhausted} withImages={withImages} setWithImages={setWithImages} onPlaySpaceship={() => setActiveGame('spaceship')} onPlayBasketball={() => setActiveGame('basketball')} onPlayProtect={() => setActiveGame('protect')} />
          )}

          {view === 'saved' && (
            <SavedStories stories={savedStories} onLoad={handleLoadStory} onDelete={(id) => { deleteStoryFromStorage(id); loadSavedStories(); }} language={language} onHome={() => setView('input')} />
          )}

          {isLoading && <Loader message={loadingMessage} language={language} />}

          {view === 'storybook' && !isLoading && storyPages.length > 0 && storyId && (
            <StorybookViewer key={storyId} pages={storyPages} pageAudio={storyAudio} onExit={handleExitToMenu} character={character} characterImage={cartoonizedCharacterImage} onSaveStory={async () => {
              try {
                setIsLoading(true);
                if (user) {
                  await saveStoryToSupabase(storyTitle, character.trait || 'Adventure', storyPages, cartoonizedCharacterImage || undefined);
                  alert("Saved to cloud!");
                } else {
                  const compressedPages = await Promise.all(storyPages.map(async (p, i) => ({ ...p, imageUrl: p.imageUrl ? await compressImage(p.imageUrl) : '', audioData: storyAudio[i] })));
                  saveStoryToStorage({ title: storyTitle, character, characterImage, pages: compressedPages, language }); 
                  alert("Saved locally!");
                }
                setIsSaved(true); loadSavedStories();
              } catch (e: any) { alert("Error: " + e.message); } finally { setIsLoading(false); }
            }} language={language} isViewingSaved={isViewingSaved} isSaved={isSaved} storyTitle={storyTitle} onCreditsUpdate={refreshCredits} />
          )}
        </main>
      </div>
    </>
  );
}

export default App;