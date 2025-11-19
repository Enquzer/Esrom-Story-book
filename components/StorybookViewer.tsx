
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Page, Language } from '../types';
import { generateSpeech } from '../services/geminiService';

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
  const sampleRate = 24000; // Gemini TTS uses 24kHz
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

// --- UI Components & Renderers ---

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
}

const renderInteractiveText = (page: Page, highlightedWordIndex: number, language: Language) => {
  if (!page.pageText) return null;

  const words = page.pageText.split(/\s+/).filter(Boolean);
  const animatableKeyword = page.animation?.keyword?.toLowerCase();

  return (
    <p className={`text-slate-700 text-lg leading-relaxed ${language === 'am' ? 'font-amharic' : ''}`}>
      {words.map((word, index) => {
        const wordKey = `${index}-${word}`;
        const cleanWord = word.replace(/[.,!?;:]/g, '').toLowerCase();
        
        const isAnimatable = animatableKeyword && cleanWord === animatableKeyword;
        const isCurrentWord = index === highlightedWordIndex;

        if (isAnimatable && page.animation) {
          return (
            <span key={wordKey} className={`transition-colors duration-200 ${isCurrentWord ? 'bg-yellow-200 rounded' : ''}`}>
              <span
                className={`interactive-word animate-${page.animation.type}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  target.classList.remove('play-animation');
                  void target.offsetWidth; // Trigger reflow
                  target.classList.add('play-animation');
                }}
                onAnimationEnd={(e) => {
                  (e.target as HTMLElement).classList.remove('play-animation');
                }}
              >
                {word}
              </span>{' '}
            </span>
          );
        }

        return (
          <span key={wordKey} className={`transition-colors duration-200 ${isCurrentWord ? 'bg-yellow-200 rounded' : 'bg-transparent'}`}>
            {word}{' '}
          </span>
        );
      })}
    </p>
  );
};

const PageContent: React.FC<PageContentProps> = React.memo(({ 
  page, 
  language, 
  playbackState, 
  onPlay, 
  onPause, 
  onResume, 
  onStop, 
  highlightedWordIndex, 
  isLoadingAudio 
}) => {
  return (
    <>
      <img src={page.imageUrl} alt="Story illustration" className="w-full h-1/2 object-cover rounded-lg mb-4 shadow" />
      <div className={`flex-grow overflow-y-auto pr-2 relative ${highlightedWordIndex > -1 ? 'is-reading' : ''}`}>
        <div className="flex flex-col gap-3">
           {/* Audio Controls */}
           <div className="flex flex-wrap items-center gap-2 mb-1">
             {isLoadingAudio ? (
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-xs font-bold">Loading...</span>
                </div>
             ) : playbackState === 'stopped' ? (
               <>
                 <button 
                   onClick={(e) => { e.stopPropagation(); onPlay(1); }}
                   className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors text-sm font-bold"
                   aria-label="Read Normal Speed"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                     <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                   </svg>
                   Read
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); onPlay(0.75); }}
                   className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors text-sm font-bold"
                   aria-label="Read Slow Speed"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                     <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                     <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                   </svg>
                   Slow
                 </button>
               </>
             ) : (
               <>
                 {playbackState === 'playing' ? (
                   <button 
                     onClick={(e) => { e.stopPropagation(); onPause(); }}
                     className="flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors text-sm font-bold"
                     aria-label="Pause"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                     </svg>
                     Pause
                   </button>
                 ) : (
                   <button 
                     onClick={(e) => { e.stopPropagation(); onResume(); }}
                     className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors text-sm font-bold"
                     aria-label="Resume"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                     </svg>
                     Resume
                   </button>
                 )}
                 <button 
                   onClick={(e) => { e.stopPropagation(); onStop(); }}
                   className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-sm font-bold"
                   aria-label="Stop"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                   </svg>
                   Stop
                 </button>
               </>
             )}
           </div>
           
           <div className="flex-grow">
            {renderInteractiveText(page, highlightedWordIndex, language)}
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
  isViewingSaved: boolean;
  isSaved: boolean;
}

const StorybookViewer: React.FC<StorybookViewerProps> = ({ pages, pageAudio, language, onExit, onSaveStory, isViewingSaved, isSaved }) => {
  const [currentSpread, setCurrentSpread] = useState(0);
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([]);
  
  // Playback State
  const [activePageIndex, setActivePageIndex] = useState<number | null>(null);
  const [playbackState, setPlaybackState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [activeSpeed, setActiveSpeed] = useState<number>(1);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<number>(-1);
  const [loadingAudioIndex, setLoadingAudioIndex] = useState<number | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0); // Store start time of current playback segment

  useEffect(() => {
    // Initialize AudioContext
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // Pre-decode all available audio
    const decodeAllAudio = async () => {
        if (!audioContextRef.current) return;
        const decodedBuffers = await Promise.all(pageAudio.map(audioBase64 => {
            if (!audioBase64 || !audioContextRef.current) return null;
            try {
                const base64 = audioBase64.split(',')[1];
                const bytes = decode(base64);
                return decodeAudioData(bytes, audioContextRef.current);
            } catch (e) {
                console.error("Failed to decode audio", e);
                return null;
            }
        }));
        setAudioBuffers(decodedBuffers);
    };
    decodeAllAudio();

    return () => { 
        hardStop();
        audioContextRef.current?.close(); 
    };
  }, [pageAudio]);
  
  const hardStop = useCallback(() => {
    if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e) {}
        sourceNodeRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
    setActivePageIndex(null);
    setPlaybackState('stopped');
    setHighlightedWordIndex(-1);
  }, []);

  const playPageAudio = useCallback(async (pageIndex: number, speed: number = 1) => {
    // If different page or speed, stop previous
    if (activePageIndex !== null) {
        hardStop();
    }

    let buffer = audioBuffers[pageIndex];

    // On-demand generation for saved stories or missing buffers
    if (!buffer && pages[pageIndex]) {
        try {
            setLoadingAudioIndex(pageIndex);
            const newAudioBase64 = await generateSpeech(pages[pageIndex].pageText);
            const bytes = decode(newAudioBase64);
            if (audioContextRef.current) {
                buffer = await decodeAudioData(bytes, audioContextRef.current);
                setAudioBuffers(prev => {
                    const newBuffers = [...prev];
                    newBuffers[pageIndex] = buffer;
                    return newBuffers;
                });
            }
        } catch(e) {
            console.error("On-demand speech failed", e);
            setLoadingAudioIndex(null);
            return;
        } finally {
            setLoadingAudioIndex(null);
        }
    }
    
    if (!buffer || !audioContextRef.current) return;
    
    // Ensure context is running
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    
    setActivePageIndex(pageIndex);
    setActiveSpeed(speed);
    setPlaybackState('playing');

    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = speed;
    sourceNode.connect(audioContextRef.current.destination);
    sourceNode.start();
    sourceNodeRef.current = sourceNode;

    // --- Synchronization Logic ---
    const words = pages[pageIndex].pageText.split(/\s+/).filter(Boolean);
    const bufferDuration = buffer.duration;
    // Store the context time when we started
    startTimeRef.current = audioContextRef.current.currentTime;
    
    const animate = () => {
        if (!audioContextRef.current || !sourceNodeRef.current) return;

        // If paused via context suspension, currentTime doesn't advance, 
        // so we don't need special logic for pause state here, 
        // but we should only update if state is 'playing'.
        
        // Calculation:
        // elapsedTime (wall clock relative to context) = ctx.currentTime - startTime
        // audioConsumed = elapsedTime * speed
        const elapsedTime = audioContextRef.current.currentTime - startTimeRef.current;
        const audioConsumed = elapsedTime * speed;
        
        if (audioConsumed >= bufferDuration) {
            setHighlightedWordIndex(-1);
            return; 
        }

        const percentComplete = audioConsumed / bufferDuration;
        const newWordIndex = Math.floor(percentComplete * words.length);
        
        setHighlightedWordIndex(Math.min(newWordIndex, words.length - 1));
        animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    sourceNode.onended = () => {
        // Only trigger stop if we didn't manually stop it (which sets source to null)
        if (sourceNodeRef.current === sourceNode) {
            hardStop();
        }
    };

  }, [activePageIndex, audioBuffers, pages, hardStop]);

  const pauseAudio = useCallback(() => {
      if (audioContextRef.current) {
          audioContextRef.current.suspend();
          setPlaybackState('paused');
          if (animationFrameRef.current) {
              cancelAnimationFrame(animationFrameRef.current);
          }
      }
  }, []);

  const resumeAudio = useCallback(() => {
      if (audioContextRef.current) {
          audioContextRef.current.resume();
          setPlaybackState('playing');
          // Restart animation loop
          const animate = () => {
              if (!audioContextRef.current || !sourceNodeRef.current) return;
              // Recalculate based on stored startTime (which is relative to context timeline)
              // When suspended, context time paused, so existing math holds true.
              const elapsedTime = audioContextRef.current.currentTime - startTimeRef.current;
              const audioConsumed = elapsedTime * activeSpeed;
              
              // Need access to buffer duration. Since we are in closure, might be tricky if we don't store it.
              // But we can check the source's buffer
              const bufferDuration = sourceNodeRef.current.buffer?.duration || 0;
              const words = pages[activePageIndex!].pageText.split(/\s+/).filter(Boolean);

              if (audioConsumed >= bufferDuration) {
                  setHighlightedWordIndex(-1);
                  return;
              }
              const percentComplete = audioConsumed / bufferDuration;
              const newWordIndex = Math.floor(percentComplete * words.length);
              setHighlightedWordIndex(Math.min(newWordIndex, words.length - 1));
              animationFrameRef.current = requestAnimationFrame(animate);
          }
          animationFrameRef.current = requestAnimationFrame(animate);
      }
  }, [activePageIndex, activeSpeed, pages]);

  // Stop audio when turning pages (changing spread)
  useEffect(() => {
    hardStop();
  }, [currentSpread, hardStop]);


  const papers = useMemo(() => {
    const p = [];
    if (pages.length > 0) {
      p.push({
        front: { page: pages[0], pageIndex: 0 },
        back: pages[1] ? { page: pages[1], pageIndex: 1 } : null
      });
    }
    for (let i = 2; i < pages.length; i += 2) {
      p.push({
        front: { page: pages[i], pageIndex: i },
        back: pages[i + 1] ? { page: pages[i + 1], pageIndex: i + 1 } : null
      });
    }
    return p;
  }, [pages]);

  const totalSpreads = papers.length;
  const isAtEndInteraction = currentSpread === totalSpreads;

  const handleNext = () => setCurrentSpread(s => Math.min(s + 1, totalSpreads));
  const handlePrev = () => setCurrentSpread(s => Math.max(s - 1, 0));
  
  const getPageNumberText = () => {
    if (currentSpread === 0) return `Cover`;
    const leftPageNum = (currentSpread -1) * 2 + 2;
    const rightPageNum = leftPageNum + 1;
    if (rightPageNum <= pages.length) return `Pages ${leftPageNum}-${rightPageNum}`;
    if (leftPageNum <= pages.length) return `Page ${leftPageNum}`;
    return `The End`;
  }

  return (
    <div className="flex flex-col items-center w-full relative">
      {/* Back to Home Button - Absolute Top Left */}
      <button 
        onClick={onExit}
        className="absolute top-[-3rem] left-0 sm:left-4 flex items-center gap-2 bg-white/80 hover:bg-white text-slate-700 hover:text-blue-600 px-4 py-2 rounded-full shadow-md transition-all font-bold z-50 backdrop-blur-sm"
      >
         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
           <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
         </svg>
         Home
      </button>

      <div className="book-container mt-8">
        <div className="book">
          <div className="paper back-cover" style={{ zIndex: 0 }}></div>
          {papers.map((paper, index) => {
            const isFlipped = currentSpread > index;
            const zIndex = isFlipped ? (totalSpreads + index) : (totalSpreads - index);

            return (
                <div 
                    key={index} 
                    className={`paper ${isFlipped ? 'flipped' : ''}`} 
                    style={{ zIndex }}
                >
                  <div className="page-content front">
                    {paper.front && (
                        <PageContent 
                            page={paper.front.page} 
                            language={language} 
                            playbackState={activePageIndex === paper.front.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.front.pageIndex}
                            onPlay={(speed) => playPageAudio(paper.front!.pageIndex, speed)}
                            onPause={pauseAudio}
                            onResume={resumeAudio}
                            onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.front.pageIndex ? highlightedWordIndex : -1}
                        />
                    )}
                  </div>
                  <div className="page-content back">
                    {paper.back && (
                        <PageContent 
                            page={paper.back.page} 
                            language={language} 
                            playbackState={activePageIndex === paper.back.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.back.pageIndex}
                            onPlay={(speed) => playPageAudio(paper.back!.pageIndex, speed)}
                            onPause={pauseAudio}
                            onResume={resumeAudio}
                            onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.back.pageIndex ? highlightedWordIndex : -1}
                        />
                    )}
                  </div>
                </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center space-x-4 md:space-x-8 mt-8 w-full">
        <button onClick={handlePrev} disabled={currentSpread === 0} className="nav-button">Prev</button>
        <div className="flex flex-col items-center">
            <span className="text-slate-600 font-semibold w-32 text-center">{getPageNumberText()}</span>
        </div>
        <button onClick={handleNext} disabled={isAtEndInteraction} className="nav-button">Next</button>
      </div>
      
      {isAtEndInteraction && (
        <div className="mt-8 w-full max-w-2xl">
           <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-4 text-center animate-fade-in">
              <h2 className="text-3xl font-bold text-slate-800">The End!</h2>
              <p className="text-lg text-slate-600">What a wonderful adventure!</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
                  <button onClick={onExit} className="bg-green-600 text-white font-bold text-lg py-3 px-8 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transform hover:scale-105 transition-all duration-300">
                    Create New Story
                  </button>
                  {!isViewingSaved && (
                      <button onClick={onSaveStory} disabled={isSaved} className="bg-indigo-600 text-white font-bold text-lg py-3 px-8 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transform hover:scale-105 transition-all duration-300 disabled:bg-slate-400 disabled:cursor-not-allowed">
                          {isSaved ? 'Story Saved!' : 'Save This Adventure'}
                      </button>
                  )}
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StorybookViewer;
