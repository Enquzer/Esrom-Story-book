import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Page, Language, Character } from '../types';
import { generateSpeech, generateStoryVideo, generateImage } from '../services/geminiService';
import { translations } from '../translations';

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
  onGenerateImage, isGeneratingImage, t
}) => {
  return (
    <>
      <div className="w-full h-1/2 relative rounded-lg mb-4 overflow-hidden shadow bg-slate-200 group">
        {page.imageUrl ? (
          <img src={page.imageUrl} alt="Story illustration" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
            {isGeneratingImage ? (
              <div className="flex flex-col items-center gap-2">
                <span className="animate-spin text-3xl">🎨</span>
                <span className="text-sm font-bold text-slate-500">{t.paintingImagination}</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">{t.noIllustration}</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); onGenerateImage(); }}
                  className="bg-blue-600 text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-blue-700 transition-all shadow-md"
                >
                  ✨ {t.generateIllustration} (2 Credits)
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className={`flex-grow overflow-y-auto pr-2 relative ${highlightedWordIndex > -1 ? 'is-reading' : ''}`}>
        <div className="flex flex-col gap-3">
           <div className="flex flex-wrap items-center gap-2 mb-1 no-print">
             {isLoadingAudio ? (
                <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  <span className="animate-spin text-xs">🌀</span>
                  <span className="text-xs font-bold">{t.loadingVoice}</span>
                </div>
             ) : playbackState === 'stopped' ? (
                <button onClick={(e) => { e.stopPropagation(); onPlay(1); }} className="px-4 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-bold shadow-sm">
                  {t.playPage}
                </button>
             ) : (
               <>
                 <button onClick={(e) => { e.stopPropagation(); playbackState === 'playing' ? onPause() : onResume(); }} className="px-4 py-1.5 rounded-full bg-yellow-400 text-slate-800 hover:bg-yellow-500 transition-colors text-sm font-bold shadow-sm">
                    {playbackState === 'playing' ? t.pause : t.resume}
                 </button>
                 <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="px-4 py-1.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-sm font-bold">
                   {t.stop}
                 </button>
               </>
             )}
           </div>
           <div className="flex-grow">
            {renderInteractiveText(page, highlightedWordIndex, language, onPause)}
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
}

const StorybookViewer: React.FC<StorybookViewerProps> = ({ 
  pages, pageAudio, language, character, characterImage, onExit, onSaveStory, isViewingSaved, isSaved, storyTitle, onCreditsUpdate 
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const decodeAllAudio = async () => {
        if (!audioContextRef.current) return;
        const decodedBuffers = await Promise.all(pageAudio.map(audioBase64 => {
            if (!audioBase64 || !audioContextRef.current) return null;
            try {
                const bytes = decode(audioBase64.split(',')[1]);
                return decodeAudioData(bytes, audioContextRef.current);
            } catch (e) { return null; }
        }));
        setAudioBuffers(decodedBuffers);
    };
    decodeAllAudio();
    return () => { hardStop(); audioContextRef.current?.close(); };
  }, [pageAudio]);

  const hardStop = useCallback(() => {
    if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e) {}
        sourceNodeRef.current = null;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
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
      alert(e.message || t.failedGenerateImage);
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  const playPageAudio = useCallback(async (pageIndex: number, speed: number = 1) => {
    if (activePageIndex !== null) hardStop();
    let buffer = audioBuffers[pageIndex];
    if (!buffer && localPages[pageIndex]) {
        try {
            setLoadingAudioIndex(pageIndex);
            const newAudioBase64 = await generateSpeech(localPages[pageIndex].pageText);
            const bytes = decode(newAudioBase64);
            if (audioContextRef.current) {
                buffer = await decodeAudioData(bytes, audioContextRef.current);
                setAudioBuffers(prev => { const n = [...prev]; n[pageIndex] = buffer; return n; });
            }
        } catch(e) { return; } finally { setLoadingAudioIndex(null); }
    }
    if (!buffer || !audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    
    setActivePageIndex(pageIndex);
    setActiveSpeed(speed);
    setPlaybackState('playing');
    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = speed;
    sourceNode.connect(audioContextRef.current.destination);
    sourceNode.start();
    sourceNodeRef.current = sourceNode;
    startTimeRef.current = audioContextRef.current.currentTime;
    const words = localPages[pageIndex].pageText.split(/\s+/).filter(Boolean);
    const duration = buffer.duration;
    
    const animate = () => {
        if (!audioContextRef.current || !sourceNodeRef.current) return;
        const audioConsumed = (audioContextRef.current.currentTime - startTimeRef.current) * speed;
        if (audioConsumed >= duration) { setHighlightedWordIndex(-1); return; }
        setHighlightedWordIndex(Math.min(Math.floor((audioConsumed / duration) * words.length), words.length - 1));
        animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    sourceNode.onended = () => {
        hardStop();
        if (isAutoPlay) {
            setTimeout(() => {
                const isLeftPage = pageIndex % 2 === 0;
                if (isLeftPage && localPages[pageIndex + 1]) {
                    playPageAudio(pageIndex + 1, speed);
                } else if (pageIndex < localPages.length - 1) {
                    handleNext();
                    setTimeout(() => playPageAudio(pageIndex + 1, speed), 1600);
                }
            }, 1000);
        }
    };
  }, [activePageIndex, audioBuffers, localPages, hardStop, isAutoPlay, handleNext]);

  const pauseAudio = () => { audioContextRef.current?.suspend(); setPlaybackState('paused'); };
  const resumeAudio = () => { audioContextRef.current?.resume(); setPlaybackState('playing'); };

  const handleGenerateTrailer = async () => {
    try {
        setVideoLoadingMsg(t.preparingTrailer);
        const climaxPage = localPages[Math.floor(localPages.length * 0.7)];
        const url = await generateStoryVideo(climaxPage.pageText, setVideoLoadingMsg);
        setVideoUrl(url);
    } catch (e) {
        alert(t.videoLimitReached);
    } finally {
        setVideoLoadingMsg(null);
    }
  };

  const handleDownloadJSON = () => {
    const storyData = {
      title: storyTitle || "My Adventure",
      character: character,
      language: language,
      timestamp: Date.now(),
      pages: localPages.map((p, i) => ({
        ...p,
        audioData: pageAudio[i] || null
      }))
    };
    
    const blob = new Blob([JSON.stringify(storyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(storyTitle || 'story').replace(/\s+/g, '_').toLowerCase()}_data.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const papers = useMemo(() => {
    const p = [];
    for (let i = 0; i < localPages.length; i += 2) {
      p.push({
        front: { page: localPages[i], pageIndex: i },
        back: localPages[i + 1] ? { page: localPages[i + 1], pageIndex: i + 1 } : null
      });
    }
    return p;
  }, [localPages]);

  return (
    <div className="flex flex-col items-center w-full relative pb-20">
      {/* Home Button */}
      <button onClick={onExit} className="absolute top-[-3rem] left-0 bg-white/90 px-4 py-2 rounded-full shadow font-bold z-50 no-print hover:bg-white">
         🏠 {t.home}
      </button>

      <div className="book-container mt-8">
        <div className="book">
          <div className="paper back-cover" style={{ zIndex: 0 }}></div>
          {papers.map((paper, index) => {
            const isFlipped = currentSpread > index;
            const zIndex = isFlipped ? (papers.length + index) : (papers.length - index);
            return (
                <div key={index} className={`paper ${isFlipped ? 'flipped' : ''}`} style={{ zIndex }}>
                  <div className="page-content front">
                    {paper.front && (
                        <PageContent 
                            page={paper.front.page} language={language} 
                            playbackState={activePageIndex === paper.front.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.front.pageIndex}
                            onPlay={(s) => playPageAudio(paper.front!.pageIndex, s)}
                            onPause={pauseAudio} onResume={resumeAudio} onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.front.pageIndex ? highlightedWordIndex : -1}
                            onGenerateImage={() => handleGenerateImage(paper.front!.pageIndex)}
                            isGeneratingImage={generatingImageIndex === paper.front.pageIndex}
                            t={t}
                        />
                    )}
                  </div>
                  <div className="page-content back">
                    {paper.back && (
                        <PageContent 
                            page={paper.back.page} language={language} 
                            playbackState={activePageIndex === paper.back.pageIndex ? playbackState : 'stopped'}
                            isLoadingAudio={loadingAudioIndex === paper.back.pageIndex}
                            onPlay={(s) => playPageAudio(paper.back!.pageIndex, s)}
                            onPause={pauseAudio} onResume={resumeAudio} onStop={hardStop}
                            highlightedWordIndex={activePageIndex === paper.back.pageIndex ? highlightedWordIndex : -1}
                            onGenerateImage={() => handleGenerateImage(paper.back!.pageIndex)}
                            isGeneratingImage={generatingImageIndex === paper.back.pageIndex}
                            t={t}
                        />
                    )}
                  </div>
                </div>
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

        {currentSpread >= papers.length && (
            <div className="bg-white p-8 rounded-3xl shadow-2xl space-y-6 text-center animate-fade-in w-full max-w-xl border-4 border-blue-50">
                <h2 className="text-4xl font-extrabold text-blue-600">{t.theEnd}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button onClick={onSaveStory} disabled={isSaved} className="bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50">
                        {isSaved ? `✅ ${t.storySaved}` : `💾 ${t.saveToLibrary}`}
                    </button>
                    <button onClick={handleDownloadJSON} className="bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition-all shadow-lg">
                        📥 {t.downloadData}
                    </button>
                    <button onClick={() => window.print()} className="bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 shadow-lg">
                        📄 {t.printPdf}
                    </button>
                    <button onClick={handleGenerateTrailer} disabled={!!videoLoadingMsg || !!videoUrl} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl hover:opacity-90 shadow-lg disabled:opacity-50 sm:col-span-2">
                        {videoLoadingMsg ? `🎬 ${t.processingTrailer}` : videoUrl ? `✅ ${t.trailerReady}` : `🎥 ${t.generateTrailer}`}
                    </button>
                </div>
                
                {videoLoadingMsg && (
                    <div className="p-4 bg-blue-50 rounded-xl animate-pulse">
                        <p className="text-blue-700 font-bold">{videoLoadingMsg}</p>
                    </div>
                )}
                
                {videoUrl && (
                    <div className="mt-4 space-y-3">
                        <video controls src={videoUrl} className="w-full rounded-xl shadow-inner bg-black" />
                        <a href={videoUrl} download="story-trailer.mp4" className="inline-block text-blue-600 font-bold hover:underline">Download MP4</a>
                    </div>
                )}
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