import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Page, Language } from '../types';

interface InteractivePaperProps {
  frontContent: React.ReactNode;
  backContent: React.ReactNode;
  isFlipped: boolean;
  zIndex: number;
  onFlip: (flipped: boolean) => void;
  canFlipNext: boolean;
  canFlipPrev: boolean;
}

const InteractivePaper: React.FC<InteractivePaperProps> = ({
  frontContent,
  backContent,
  isFlipped,
  zIndex,
  onFlip,
  canFlipNext,
  canFlipPrev
}) => {
  const paperRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(isFlipped ? -180 : 0);
  const rotationRef = useRef(isFlipped ? -180 : 0);
  const targetRotationRef = useRef(isFlipped ? -180 : 0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startRotationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  // Sync internal state when prop changes (for nav buttons)
  useEffect(() => {
    const target = isFlipped ? -180 : 0;
    targetRotationRef.current = target;
    // If not dragging, start animation to target
    if (!isDraggingRef.current) {
        startAnimation();
    }
  }, [isFlipped]);

  const updateStyles = useCallback((rot: number) => {
    if (!paperRef.current) return;

    // 1. Apply Rotation and Skew (Peel Effect)
    // Formula: skewY = -sin(rotationRad) * 5deg (Negative sin because rotation is 0 to -180)
    const rad = (rot * Math.PI) / 180;
    const skew = -Math.sin(rad) * 5;
    
    paperRef.current.style.transform = `rotateY(${rot}deg) skewY(${skew}deg)`;
    paperRef.current.style.zIndex = String(zIndex);

    // 2. Dynamic Clip-Path (Curl Logic)
    // As rotation reaches -90, taper corners.
    // 0deg: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)
    // -90deg: polygon(0% 0%, 100% 10%, 100% 90%, 0% 100%) - simplified taper
    // -180deg: back to flat (but mirrored)
    
    // Calculate taper factor: 0 at 0 or -180, peaks at -90
    // abs(sin(rad)) peaks at -90 (sin(-90) = -1)
    const taper = Math.abs(Math.sin(rad)) * 10; // 10% taper
    const clipPath = `polygon(0% 0%, 100% ${taper}%, 100% ${100 - taper}%, 0% 100%)`;
    paperRef.current.style.clipPath = clipPath;

    // 3. Dynamic Shading
    // Apply linear-gradient overlay to the .front face via shadowRef
    // Opacity tied to rotation: 0 at 0, 0.3 at -90
    if (shadowRef.current) {
        const shadowOpacity = Math.abs(Math.sin(rad)) * 0.3;
        shadowRef.current.style.opacity = String(shadowOpacity);
    }
  }, [zIndex]);

  const animate = useCallback(() => {
    const diff = targetRotationRef.current - rotationRef.current;
    if (Math.abs(diff) < 0.1) {
      rotationRef.current = targetRotationRef.current;
      setRotation(rotationRef.current);
      updateStyles(rotationRef.current);
      animationFrameRef.current = null;
      return;
    }

    rotationRef.current += diff * 0.15; // Smooth damping
    setRotation(rotationRef.current);
    updateStyles(rotationRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [updateStyles]);

  const startAnimation = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canFlipNext && !isFlipped) return;
    if (!canFlipPrev && isFlipped) return;

    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startRotationRef.current = rotationRef.current;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    paperRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - startXRef.current;
    // Sensitivity: 180 degrees over roughly 50% of screen width (approx 500px)
    const movement = (deltaX / 500) * 180;
    
    let newRotation = startRotationRef.current + movement;
    
    // Clamp rotation
    newRotation = Math.max(-180, Math.min(0, newRotation));
    
    rotationRef.current = newRotation;
    updateStyles(newRotation);
    setRotation(newRotation);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    paperRef.current?.releasePointerCapture(e.pointerId);

    // Snap logic: if abs(rotation) > 90, animate to -180, else animate to 0
    if (Math.abs(rotationRef.current) > 90) {
      targetRotationRef.current = -180;
      onFlip(true);
    } else {
      targetRotationRef.current = 0;
      onFlip(false);
    }
    startAnimation();
  };

  return (
    <div
      ref={paperRef}
      className="paper interactive-paper"
      style={{
        zIndex,
        perspective: '2000px',
        transformStyle: 'preserve-3d',
        transformOrigin: 'left center',
        cursor: 'grab',
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="page-content front relative bg-white border-l-2 border-slate-200">
        {frontContent}
        {/* Dynamic Shadow Overlay */}
        <div 
            ref={shadowRef}
            className="absolute inset-0 pointer-events-none transition-opacity duration-75"
            style={{
                background: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, transparent 15%, transparent 100%)',
                opacity: 0,
                zIndex: 10
            }}
        />
        {/* Page Line for Hinge */}
        <div className="absolute top-0 left-0 w-[2px] h-full bg-slate-200 z-20" />
      </div>
      <div className="page-content back relative bg-white border-r-2 border-slate-200">
        <div className="absolute top-0 right-0 w-[2px] h-full bg-slate-200 z-20" />
        {backContent}
      </div>
    </div>
  );
};

export default InteractivePaper;
