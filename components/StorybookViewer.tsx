import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Page, Language, Character } from '../types';
import { generateSpeech, generateStoryVideo, generateImage } from '../services/geminiService';
import { translations } from '../translations';
import InteractivePaper from './InteractivePaper';

// --- Audio Helper Functions ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  const sampleRate = 24000;
  const numChannels = 1;
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

interface PageContentProps {
  page: Page;
  language: Language;
  playbackState: 'stopped' | 'playing' | 'paused';
  onPlay: (speed: number) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  highlightedWordIndex: number;
  isLoadingAudio: boolean;
  onGenerateImage: () => void;
  isGeneratingImage: boolean;
  onHome: () => void;
  t: any;
}

const renderInteractiveText = (page: Page, highlightedWordIndex: number, language: Language, onPausePlayback: () => void) => {
  if (!page.pageText) return null;
  const words = page.pageText.split(/\s+/).filter(Boolean);
  const animatableKeyword = page.animation?.keyword?.toLowerCase();

  const speakWord = (text: string) => {
    onPausePlayback();
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'am' ? 'am-ET' : 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <p className={`text-slate-700 text-xl leading-relaxed ${language === 'am' ? 'font-amharic' : ''} select-none`}>
      {words.map((word, index) => {
        const cleanWord = word.replace(/[.,!?;:"'()]/g, '').toLowerCase();
        const isAnimatable = animatableKeyword && cleanWord === animatableKeyword;
        const isCurrentWord = index === highlightedWordIndex;

        return (
          <span 
            key={index} 
            className={`transition-all duration-300 inline-block px-1 ${isCurrentWord ? 'scale-110 font-bold text-blue-600 bg-yellow-200 rounded shadow-sm' : 'bg-transparent'}`}
            onDoubleClick={(e) => { e.stopPropagation(); speakWord(cleanWord); }}
          >
            {word}{' '}
          </span>
        );
      })}
    </p>
  );
};

const PageContent: React.FC<PageContentProps> = React.memo(({ 
  page, language, playbackState, onPlay, onPause, onResume, onStop, highlightedWordIndex, isLoadingAudio,
  onGenerateImage, isGeneratingImage, onHome, t
}) => {
  const words = page.pageText.split(/\s+/).filter(Boolean);
  const animatableWord = page.animation?.keyword?.toLowerCase();
  const animationType = page.animation?.type || 'bounce';

  return (
    <>
      <div className="w-full h-1/2 relative rounded-lg mb-4 overflow-hidden shadow bg-slate-200 group">
        <button 
          onClick={(e) => { e.stopPropagation(); onHome(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-40 bg-white/90 backdrop-blur-md p-2.5 rounded-full shadow-lg hover:bg-white transition-all hover:scale-110 active:scale-95 no-print"
          title={t.home}
        >
          <span className="text-xl">🏠</span>
        </button>

        {page.imageUrl ? (
          <img src={page.imageUrl} alt="Story illustration" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-linear-to-br from-violet-50 via-indigo-50 to-blue-50 animate-pulse">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center gap-2">
                <span className="animate-spin text-3xl">🎨</span>
                <span className="text-sm font-bold text-slate-500">{t.paintingImagination}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <span className="text-5xl">✨</span>
                  <span className="absolute -top-1 -right-1 text-2xl animate-bounce">🖌️</span>
                </div>
                <p className="text-indigo-500 font-bold text-sm mt-1">The magic ink is drying...</p>
                <p className="text-indigo-300 text-xs">Your illustration is being painted</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={`grow overflow-y-auto pr-2 relative ${highlightedWordIndex > -1 ? 'is-reading' : ''}`}>
        <div className="flex flex-col gap-3">
           <div className="flex flex-wrap items-center gap-2 mb-1 no-print">
              {playbackState === 'stopped' ? (
                 <button 
                  onClick={(e) => { e.stopPropagation(); onPlay(1); }} 
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  className="px-4 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-bold shadow-sm"
                 >
                   {t.playPage}
                 </button>
              ) : (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); playbackState === 'playing' ? onPause() : onResume(); }} 
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    className="px-4 py-1.5 rounded-full bg-yellow-400 text-slate-800 hover:bg-yellow-500 transition-colors text-sm font-bold shadow-sm"
                  >
                     {playbackState === 'playing' ? t.pause : t.resume}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onStop(); }} 
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    className="px-4 py-1.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-sm font-bold"
                  >
                    {t.stop}
                  </button>
                </>
              )}
           </div>
           <div className="grow">
            <p className={`text-slate-700 text-xl leading-relaxed ${language === 'am' ? 'font-amharic' : ''} select-none`}>
              {words.map((word, index) => {
                const cleanWord = word.replace(/[.,!?;:"'()]/g, '').toLowerCase();
                const isCurrent = index === highlightedWordIndex;
                const isAction = animatableWord && cleanWord === animatableWord;
                
                return (
                  <span 
                    key={index} 
                    className={`transition-all duration-300 inline-block px-1 rounded-md
                      ${isCurrent ? 'bg-yellow-200 text-blue-700 scale-110 font-black shadow-[0_2px_8px_rgba(0,0,0,0.1)] z-10' : ''} 
                      ${isAction && isCurrent ? `animate-${animationType}` : ''}
                    `}
                  >
                    {word}{' '}
                  </span>
                );
              })}
            </p>
           </div>
        </div>
      </div>
    </>
  );
});

interface StorybookViewerProps {
  pages: Page[];
  pageAudio: (string | null)[];
  onExit: () => void;
  onSaveStory: () => void;
  language: Language;
  character: Character;
  characterImage: string | null;
  isViewingSaved: boolean;
  isSaved: boolean;
  storyTitle?: string;
  onCreditsUpdate: () => void;
  withImages?: boolean;
  isPhase2Loading?: boolean;  // true while background images (pages 4-6) are loading
}

const StorybookViewer: React.FC<StorybookViewerProps> = ({ 
  pages, pageAudio, language, character, characterImage, onExit, onSaveStory, isViewingSaved, isSaved, storyTitle, onCreditsUpdate,
  withImages = false, isPhase2Loading = false
}) => {
  const [currentSpread, setCurrentSpread] = useState(0);
  const t = translations[language];
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [activeSpeed, setActiveSpeed] = useState<number>(1);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);
  const [loadingAudioIndex, setLoadingAudioIndex] = useState<number | null>(null);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoadingMsg, setVideoLoadingMsg] = useState<string | null>(null);
  const [localPages, setLocalPages] = useState<Page[]>(pages);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const hasQuotaFailedRef = useRef(false);

  useEffect(() => {
    return () => { hardStop(); window.speechSynthesis.cancel(); };
  }, []);

  const hardStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setActivePageIndex(null);
    setPlaybackState('stopped');
    setHighlightedWordIndex(-1);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSpread(s => {
        const total = Math.ceil(pages.length / 2);
        return Math.min(s + 1, total);
    });
  }, [pages.length]);

  const handleGenerateImage = async (pageIndex: number) => {
    if (generatingImageIndex !== null) return;
    try {
      setGeneratingImageIndex(pageIndex);
      const imageUrl = await generateImage(localPages[pageIndex].imagePrompt, characterImage);
      setLocalPages(prev => {
        const next = [...prev];
        next[pageIndex] = { ...next[pageIndex], imageUrl };
        return next;
      });
      onCreditsUpdate();
    } catch (e: any) {
      if (e.message?.includes('429') || e.message === 'QUOTA_EXHAUSTED' || e.status === 429) {
          hasQuotaFailedRef.current = true;
          setShowQuotaWarning(true);
          alert("Your Gemini API quota has been reached! Please wait a bit before generating more magic.");
      } else {
        alert(e.message || t.failedGenerateImage);
      }
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  // --- PAGES UPDATE from parent (phase 2 patching) ---
  // When the parent patches in phase-2 images, sync localPages
  useEffect(() => {
    setLocalPages(pages);
  }, [pages]);

  const playPageAudio = useCallback(async (pageIndex: number, speed: number = 1) => {
    hardStop();
    if (!localPages[pageIndex]) return;

    setActivePageIndex(pageIndex);
    setPlaybackState('playing');

    const utterance = new SpeechSynthesisUtterance(localPages[pageIndex].pageText);
    utterance.lang = language === 'am' ? 'am-ET' : 'en-US';
    utterance.rate = 0.95;

    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            const textToChar = localPages[pageIndex].pageText.substring(0, charIndex);
            // Count words up to this point
            const wordCount = textToChar.trim() === '' ? 0 : textToChar.trim().split(/\s+/).length;
            setHighlightedWordIndex(wordCount);
        }
    };

    utterance.onend = () => {
        setHighlightedWordIndex(-1);
        setPlaybackState('stopped');
        
        if (isAutoPlay) {
            const hasNextPage = !!localPages[pageIndex + 1];
            
            if (hasNextPage) {
                // THE GOLDEN RULE: 
                // Index 0 (Cover) MUST flip to see Page 1.
                // Even indices (2, 4...) are Right-hand pages that MUST flip to see the next spread.
                const shouldFlip = (pageIndex === 0) || (pageIndex > 0 && pageIndex % 2 === 0);

                if (shouldFlip) {
                    console.log("Auto-Play: Flipped page to reveal next content");
                    handleNext(); 
                    // Give the 3D engine time to settle the 'Soft Curve' mesh
                    setTimeout(() => {
                        playPageAudio(pageIndex + 1, speed);
                    }, 1900);
                } else {
                    // Page is already visible on the current spread
                    setTimeout(() => playPageAudio(pageIndex + 1, speed), 900);
                }
            } else {
                // END OF STORY: Stop narration and disable auto-play
                setPlaybackState('stopped');
                setActivePageIndex(null);
                setIsAutoPlay(false); 
            }
        } else {
            setActivePageIndex(null);
        }
    };

    window.speechSynthesis.speak(utterance);
  }, [localPages, language, isAutoPlay, handleNext, hardStop]);

  // --- AUTO-PLAY TRIGGER ---
  useEffect(() => {
    // If auto-play is enabled but nothing is reading, find the right starting page
    if (isAutoPlay && playbackState === 'stopped' && activePageIndex === null) {
      // Mapping current spread to the left-most visible page:
      // Spread 0: Page 0
      // Spread 1: Page 1 (and 2), Spread 2: Page 3 (and 4)
      const startIdx = currentSpread === 0 ? 0 : (currentSpread * 2 - 1);
      
      // GUARD: Don't restart if we already reached and finished the last page
      if (startIdx >= localPages.length - 1 && playbackState === 'stopped') {
          return;
      }

      if (localPages[startIdx]) {
        console.log("Auto-Play: Automatically starting narration for page", startIdx);
        playPageAudio(startIdx);
      }
    }
  }, [isAutoPlay, playbackState, activePageIndex, currentSpread, localPages, playPageAudio]);

  // Placeholder for future expansion
  useEffect(() => {
    // Keep auto-play and active state aligned if needed
  }, [isAutoPlay, activePageIndex]);

  const pauseAudio = () => { window.speechSynthesis.pause(); setPlaybackState('paused'); };
  const resumeAudio = () => { window.speechSynthesis.resume(); setPlaybackState('playing'); };

  const papers = useMemo(() => {
    const p = [];
    for (let i = 0; i < localPages.length; i += 2) {
      p.push({
        id: `paper-${i}`,
        front: { page: localPages[i], pageIndex: i },
        back: localPages[i + 1] ? { page: localPages[i + 1], pageIndex: i + 1 } : null
      });
    }
    return p;
  }, [localPages]);

  const handlePaperFlip = (index: number, flipped: boolean) => {
    if (flipped) {
      if (currentSpread === index) {
        setCurrentSpread(index + 1);
      }
    } else {
      if (currentSpread === index + 1) {
        setCurrentSpread(index);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full relative pb-20 overflow-x-hidden">
      {/* Home Button */}
      <button onClick={onExit} className="absolute -top-12 left-0 bg-white/90 px-4 py-2 rounded-full shadow font-bold z-50 no-print hover:bg-white">
         🏠 {t.home}
      </button>

      {showQuotaWarning && (
        <div className="absolute -top-12 right-0 bg-amber-100 text-amber-800 px-4 py-2 rounded-full shadow-sm text-xs font-bold flex items-center gap-2 animate-pulse z-50">
           ⚠️ {t.limitReached}
        </div>
      )}

      <div className="book-container mt-8">
        <div className="book">
          <div className="book-spine" />
          <div className="paper back-cover" style={{ zIndex: 0 }}></div>
          {papers.map((paper, index) => {
            const isFlipped = currentSpread > index;
            // Photorealistic Stacking Logic:
            // Flipped pages (left stack): Later pages (higher index) on top
            // Unflipped pages (right stack): Earlier pages (lower index) on top
            const zIndex = isFlipped ? (100 + index) : (papers.length - index);
            
            // Only allow flipping the current page or the one before it
            const canFlipNext = currentSpread === index;
            const canFlipPrev = currentSpread === index + 1;

            return (
                <InteractivePaper
                  key={paper.id}
                  isFlipped={isFlipped}
                  zIndex={zIndex}
                  canFlipNext={canFlipNext}
                  canFlipPrev={canFlipPrev}
                  onFlip={(flipped) => handlePaperFlip(index, flipped)}
                  frontContent={
                    paper.front && (
                        <PageContent 
                            page={paper.front.page} language={language} 
                            playbackState={activePageIndex === paper.front.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.front.pageIndex}
                            onPlay={(s) => playPageAudio(paper.front!.pageIndex, s)}
                            onPause={pauseAudio} onResume={resumeAudio} onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.front.pageIndex ? highlightedWordIndex : -1}
                            onGenerateImage={() => handleGenerateImage(paper.front!.pageIndex)}
                            isGeneratingImage={generatingImageIndex === paper.front.pageIndex}
                            onHome={onExit}
                            t={t}
                        />
                    )
                  }
                  backContent={
                    paper.back && (
                        <PageContent 
                            page={paper.back.page} language={language} 
                            playbackState={activePageIndex === paper.back.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.back.pageIndex}
                            onPlay={(s) => playPageAudio(paper.back!.pageIndex, s)}
                            onPause={pauseAudio} onResume={resumeAudio} onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.back.pageIndex ? highlightedWordIndex : -1}
                            onGenerateImage={() => handleGenerateImage(paper.back!.pageIndex)}
                            isGeneratingImage={generatingImageIndex === paper.back.pageIndex}
                            onHome={onExit}
                            t={t}
                        />
                    )
                  }
                />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 mt-12 w-full no-print">
        <div className="flex items-center gap-4 bg-white p-3 rounded-2xl shadow-md border border-slate-100">
            <button onClick={() => setCurrentSpread(s => Math.max(s - 1, 0))} disabled={currentSpread === 0} className="nav-button">{t.prev}</button>
            <div className="flex flex-col items-center px-6">
                <span className="font-bold text-slate-700">{t.page} {currentSpread * 2 || t.cover}</span>
                <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                    <input type="checkbox" checked={isAutoPlay} onChange={e => setIsAutoPlay(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t.autoPlay}</span>
                </label>
            </div>
            <button onClick={handleNext} disabled={currentSpread >= papers.length} className="nav-button">{t.next}</button>
        </div>

        {/* Phase 2 background loading indicator */}
        {isPhase2Loading && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-full shadow-sm animate-pulse">
            <span className="text-lg animate-spin">🎨</span>
            <span className="text-xs font-bold text-indigo-600">Painting pages 4–6 in the background...</span>
          </div>
        )}
        {currentSpread >= papers.length && (
            <div className="bg-white/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl space-y-6 text-center animate-fade-in w-full max-w-xl border-4 border-blue-50">
                <h2 className="text-4xl font-extrabold text-blue-600">{t.theEnd}</h2>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={onSaveStory} disabled={isSaved} className="bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50">
                        {isSaved ? `✅ ${t.storySaved}` : `💾 ${t.saveToLibrary}`}
                    </button>
                    <button onClick={() => window.print()} className="bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 shadow-lg">
                        📄 {t.printPdf}
                    </button>
                    <button onClick={onExit} className="bg-white border-2 border-blue-100 text-blue-600 font-bold py-3 rounded-xl hover:bg-blue-50 transition-all shadow-md col-span-2 flex items-center justify-center gap-2">
                        🏠 {t.home}
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Hidden Printable Area */}
      <div id="printable-area" className="hidden">
        <div className="print-spread cover-print">
            <div className="page-print cover-page">
                <h1 className="text-5xl font-black text-center mb-8">{storyTitle || 'My Adventure'}</h1>
                <div className="w-full h-[400px] bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden mb-8">
                    {characterImage ? (
                        <img src={characterImage} alt="Hero" className="w-full h-full object-contain" />
                    ) : (
                        <div className="text-6xl">✨</div>
                    )}
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-slate-700">{t.aStoryAbout} {character.name}</p>
                    <p className="text-slate-500 mt-2">{t.createdWith}</p>
                </div>
            </div>
        </div>
        {papers.map((paper, i) => (
            <div key={i} className="print-spread">
                <div className="page-print">
                    <img src={paper.front.page.imageUrl || 'https://placehold.co/600x400?text=Illustration'} alt="Page" className="rounded-xl mb-4" />
                    <p className={`text-xl leading-relaxed ${language === 'am' ? 'font-amharic' : ''}`}>{paper.front.page.pageText}</p>
                </div>
                {paper.back && (
                    <div className="page-print">
                        <img src={paper.back.page.imageUrl || 'https://placehold.co/600x400?text=Illustration'} alt="Page" className="rounded-xl mb-4" />
                        <p className={`text-xl leading-relaxed ${language === 'am' ? 'font-amharic' : ''}`}>{paper.back.page.pageText}</p>
                    </div>
                )}
            </div>
        ))}
      </div>
    </div>
  );
};

export default StorybookViewer;