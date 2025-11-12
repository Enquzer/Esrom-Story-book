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

const PageContent: React.FC<{ page: Page; language: Language; highlightedWordIndex: number; }> = React.memo(({ page, language, highlightedWordIndex }) => {
  return (
    <>
      <img src={page.imageUrl} alt="Story illustration" className="w-full h-1/2 object-cover rounded-lg mb-4 shadow" />
      <div className={`flex-grow overflow-y-auto pr-2 ${highlightedWordIndex > -1 ? 'is-reading' : ''}`}>
        {renderInteractiveText(page, highlightedWordIndex, language)}
      </div>
    </>
  );
});

const AutoplayToggle: React.FC<{ enabled: boolean; setEnabled: (e: boolean) => void; }> = ({ enabled, setEnabled }) => (
    <div className="flex items-center space-x-3 text-slate-600">
        <label htmlFor="autoplay-toggle" className="font-semibold">Auto-Read</label>
        <button
            id="autoplay-toggle"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ease-in-out ${enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
        </button>
    </div>
);


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
  const [autoplay, setAutoplay] = useState(true);
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([]);
  const [highlightedWord, setHighlightedWord] = useState<{ pageIndex: number; wordIndex: number }>({ pageIndex: -1, wordIndex: -1 });

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackQueue = useRef<number[]>([]).current;
  const isPlayingRef = useRef(false);

  useEffect(() => {
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
    return () => { audioContextRef.current?.close(); };
  }, [pageAudio]);
  
  const stopPlayback = useCallback(() => {
    playbackQueue.length = 0; // Clear the queue
    if (sourceNodeRef.current) {
        sourceNodeRef.current.onended = null;
        try { sourceNodeRef.current.stop(); } catch(e) {}
        sourceNodeRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    isPlayingRef.current = false;
    setHighlightedWord({ pageIndex: -1, wordIndex: -1 });
  }, [playbackQueue]);

  const playNextInQueue = useCallback(async () => {
    if (playbackQueue.length === 0 || isPlayingRef.current) {
        isPlayingRef.current = false;
        return;
    }
    
    isPlayingRef.current = true;
    const pageIndex = playbackQueue.shift()!;

    let buffer = audioBuffers[pageIndex];

    // On-demand generation for saved stories
    if (!buffer && pages[pageIndex]) {
        try {
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
            playNextInQueue(); // Try next in queue
            return;
        }
    }
    
    if (!buffer || !audioContextRef.current) {
        playNextInQueue(); // Try next
        return;
    }
    
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    
    const sourceNode = audioContextRef.current.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(audioContextRef.current.destination);
    sourceNode.start();
    sourceNodeRef.current = sourceNode;

    const words = pages[pageIndex].pageText.split(/\s+/).filter(Boolean);
    const duration = buffer.duration;
    const wordStartTimes = words.map((_, i) => i * (duration / words.length));
    const startTime = audioContextRef.current.currentTime;
    
    const animate = () => {
        if (!audioContextRef.current) return;
        const elapsedTime = audioContextRef.current.currentTime - startTime;
        let newWordIndex = wordStartTimes.findIndex((time, i) => {
          const nextTime = wordStartTimes[i + 1] || duration;
          return elapsedTime >= time && elapsedTime < nextTime;
        });
        setHighlightedWord({ pageIndex, wordIndex: newWordIndex });
        if (elapsedTime < duration) {
            animationFrameRef.current = requestAnimationFrame(animate);
        }
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    sourceNode.onended = () => {
        setHighlightedWord({ pageIndex: -1, wordIndex: -1 });
        playNextInQueue();
    };

  }, [playbackQueue, audioBuffers, pages]);

  useEffect(() => {
    stopPlayback();
    if (autoplay && currentSpread > 0) {
        const leftPageIndex = (currentSpread - 1) * 2;
        const rightPageIndex = leftPageIndex + 1;
        if (pages[leftPageIndex]) playbackQueue.push(leftPageIndex);
        if (pages[rightPageIndex]) playbackQueue.push(rightPageIndex);
        playNextInQueue();
    }
    return () => stopPlayback();
  }, [currentSpread, autoplay, pages, stopPlayback, playNextInQueue, playbackQueue]);

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
    <div className="flex flex-col items-center w-full">
      <div className="book-container">
        <div className="book">
          <div className="paper back-cover" style={{ zIndex: 0 }}></div>
          {papers.map((paper, index) => (
            <div key={index} className={`paper ${currentSpread > index ? 'flipped' : ''}`} style={{ zIndex: totalSpreads - index }}>
              <div className="page-content front">
                {paper.front && <PageContent page={paper.front.page} language={language} highlightedWordIndex={highlightedWord.pageIndex === paper.front.pageIndex ? highlightedWord.wordIndex : -1} />}
              </div>
              <div className="page-content back">
                {paper.back && <PageContent page={paper.back.page} language={language} highlightedWordIndex={highlightedWord.pageIndex === paper.back.pageIndex ? highlightedWord.wordIndex : -1} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center space-x-4 md:space-x-8 mt-8 w-full">
        <button onClick={handlePrev} disabled={currentSpread === 0} className="nav-button">Prev</button>
        <div className="flex flex-col items-center">
            <span className="text-slate-600 font-semibold w-32 text-center">{getPageNumberText()}</span>
            <div className="mt-2">
                <AutoplayToggle enabled={autoplay} setEnabled={setAutoplay} />
            </div>
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
                    Main Menu
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