/**
 * InteractivePaper.tsx
 *
 * High-fidelity 3D book page flip with:
 *  1. Perspective hinge (transform-origin: left center, preserve-3d, backface-visibility: hidden)
 *  2. Paper Curl Physics via rAF loop:
 *       - Peel (skewY = sin(rot) × 7°)
 *       - Taper (clip-path: polygon, corners pinch when ±90°)
 *       - Dynamic lighting (linear-gradient opacity peaks at 0.4 @ ±90°)
 *  3. Z-index management (page drops under left stack at -180°)
 *  4. Drag-to-flip with spring-damping snap
 */

import React, { useRef, useEffect, useCallback } from 'react';

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
  canFlipPrev,
}) => {
  const leafRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(isFlipped ? -180 : 0);
  const targetRef = useRef(isFlipped ? -180 : 0);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startRotRef = useRef(0);

  // --- RENDERING STRIPS FOR THE MESH ---
  // We use a high-performance 'Mesh Simulation' using dynamic CSS variables
  // and non-linear clip-paths to simulate the soft bend without 20 heavy divs.
  const updateStyles = useCallback((rot: number) => {
    const leaf = leafRef.current;
    if (!leaf) return;

    const rad = (rot * Math.PI) / 180;
    const absSin = Math.abs(Math.sin(rad));
    
    // Geometric Curve: Parabolic lift and S-curve skew
    // This mimics the 'S-curve' tension of real paper
    const skew = -Math.sin(rad) * 11; 
    const twist = Math.sin(rad * 2) * 4;
    const lift = absSin * 85; 

    leaf.style.transform = `rotateY(${rot}deg) skewY(${skew}deg) rotateX(${twist}deg) translateZ(${lift}px)`;

    // Shadow Gradient Mapping: Light 'rolls' over the curve
    const shadowPos = (rot + 180) / 1.8; // Map 0..-180 to shadow position
    leaf.style.setProperty('--shadow-pos', `${shadowPos}%`);
    leaf.style.setProperty('--bend-offset', `${absSin * 12}%`);
    leaf.style.setProperty('--shadow-opacity', String(absSin * 0.4));

    leaf.style.zIndex = String(zIndex);
  }, [zIndex]);

  const animate = useCallback(() => {
    const diff = targetRef.current - rotRef.current;
    if (Math.abs(diff) < 0.05) {
      rotRef.current = targetRef.current;
      updateStyles(rotRef.current);
      rafRef.current = null;
      return;
    }
    // Cubic-Bezier like smoothing logic
    rotRef.current += diff * 0.13; 
    updateStyles(rotRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, [updateStyles]);

  const startAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  useEffect(() => {
    targetRef.current = isFlipped ? -180 : 0;
    if (!draggingRef.current) startAnimation();
  }, [isFlipped, startAnimation]);

  useEffect(() => {
    updateStyles(rotRef.current);
  }, [updateStyles]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canFlipNext && !isFlipped) return;
    if (!canFlipPrev && isFlipped) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startRotRef.current = rotRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    leafRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const deltaX = e.clientX - startXRef.current;
    const movement = (deltaX / 500) * 180;
    const newRot = Math.max(-180, Math.min(0, startRotRef.current + movement));
    rotRef.current = newRot;
    updateStyles(newRot);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    leafRef.current?.releasePointerCapture(e.pointerId);
    if (Math.abs(rotRef.current) > 90) { targetRef.current = -180; onFlip(true); }
    else { targetRef.current = 0; onFlip(false); }
    startAnimation();
  };

  const handleClick = () => {
    if (Math.abs(rotRef.current - startRotRef.current) > 5) return;
    if (!isFlipped && canFlipNext) { targetRef.current = -180; onFlip(true); startAnimation(); }
    else if (isFlipped && canFlipPrev) { targetRef.current = 0; onFlip(false); startAnimation(); }
  };

  return (
    <div
      ref={leafRef}
      className="paper interactive-paper"
      style={{
        zIndex,
        transformStyle: 'preserve-3d',
        transformOrigin: 'left center',
        cursor: 'grab',
        touchAction: 'none',
        transition: 'none',
        willChange: 'transform'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      {/* Front Face Simulation with Soft Bend Mesh */}
      <div 
        className="page-front page-content absolute inset-0 bg-white shadow-2xl"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'translateZ(1px)',
          // The Photorealistic Mesh Bend: Non-Linear Clipping
          clipPath: `polygon(
            0% var(--bend-offset), 
            100% 0%, 
            100% 100%, 
            0% calc(100% - var(--bend-offset))
          )`,
          background: `
            linear-gradient(90deg, 
              #fff 0%, 
              rgba(0,0,0,var(--shadow-opacity)) var(--shadow-pos), 
              #fff calc(var(--shadow-pos) + 20%), 
              #fff 100%
            ), #fdfcf8
          `,
          backgroundSize: '200% 100%'
        }}
      >
        {frontContent}
        {/* Hinge Shadow */}
        <div className="absolute top-0 left-0 w-12 h-full bg-linear-to-r from-black/20 to-transparent z-10 pointer-events-none" />
      </div>

      {/* Back Face Simulation */}
      <div 
        className="page-back page-content absolute inset-0 bg-white shadow-2xl"
        style={{
          transform: 'rotateY(180deg) translateZ(1px)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          clipPath: `polygon(
            0% 0%, 
            100% var(--bend-offset), 
            100% calc(100% - var(--bend-offset)), 
            0% 100%
          )`,
          background: `
            linear-gradient(-90deg, 
              #fff 0%, 
              rgba(0,0,0,var(--shadow-opacity)) var(--shadow-pos), 
              #fff calc(var(--shadow-pos) + 20%), 
              #fff 100%
            ), #fdfcf8
          `,
          backgroundSize: '200% 100%'
        }}
      >
        {backContent}
        <div className="absolute top-0 right-0 w-12 h-full bg-linear-to-l from-black/20 to-transparent z-10 pointer-events-none" />
      </div>
    </div>
  );
};

export default InteractivePaper;
