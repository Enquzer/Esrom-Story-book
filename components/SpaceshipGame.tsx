
import React, { useState, useEffect, useRef } from 'react';

interface SpaceshipGameProps {
  onBack: () => void;
  onGameOver: (score: number) => void;
  language: 'en' | 'am';
}

const SpaceshipGame: React.FC<SpaceshipGameProps> = ({ onBack, onGameOver, language }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [lives, setLives] = useState(5);
  const [isMobile, setIsMobile] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('spaceship_highscore') || '0');
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let localGameOver = false; // local flag to avoid React stale-closure freeze
    let frameCount = 0;
    let planets: any[] = [];
    let enemies: any[] = [];
    let bullets: any[] = [];
    let particles: any[] = [];
    let powerups: any[] = [];
    let debris: any[] = [];
    let explosions: any[] = [];
    let floatingTexts: any[] = [];
    let screenShake = 0;
    let specialCharge = 0; 
    let currentDebrisHeight = 0;
    let horizontalLightning: { y: number, active: boolean } = { y: 0, active: false };
    let keys: { [key: string]: boolean } = {};
    let invincibilityFrames = 0;
    let isTouching = false;
    
    const player = {
      x: canvas.width / 2 - 20,
      y: canvas.height - 120,
      width: 40,
      height: 48,
      speed: 7,
      weaponType: 'single', 
      weaponTimer: 0,
    };

    const initPlanets = () => {
      const planetOptions = [
        { name: 'Mars', color1: '#ff4d4d', color2: '#990000', size: 40 },
        { name: 'Jupiter', color1: '#ffcc80', color2: '#b35900', size: 80 },
        { name: 'Neptune', color1: '#4da6ff', color2: '#004d99', size: 50 },
        { name: 'Venus', color1: '#ffd633', color2: '#997a00', size: 35 },
        { name: 'Saturn', color1: '#f4e0af', color2: '#c4a456', size: 60, hasRings: true },
      ];

      for(let i = 0; i < 4; i++) {
        const option = planetOptions[Math.floor(Math.random() * planetOptions.length)];
        planets.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          z: Math.random() * 2000,
          baseSize: option.size,
          color1: option.color1,
          color2: option.color2,
          hasRings: option.hasRings,
          speedZ: (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random() * 2),
          angle: Math.random() * Math.PI * 2,
          orbitSpeed: (Math.random() - 0.5) * 0.005
        });
      }
    };
    initPlanets();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }
      keys[e.key] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => keys[e.key] = false;

    const handleTouchStart = (e: TouchEvent) => {
        isTouching = true;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const relativeX = ((touch.clientX - rect.left) / rect.width) * canvas.width;
        const relativeY = ((touch.clientY - rect.top) / rect.height) * canvas.height;
        player.x = Math.max(0, Math.min(canvas.width - player.width, relativeX - player.width / 2));
        player.y = Math.max(0, Math.min(canvas.height - player.height, relativeY - player.height / 2));
        e.preventDefault();
    };
    const handleTouchMove = (e: TouchEvent) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const relativeX = ((touch.clientX - rect.left) / rect.width) * canvas.width;
        const relativeY = ((touch.clientY - rect.top) / rect.height) * canvas.height;
        player.x = Math.max(0, Math.min(canvas.width - player.width, relativeX - player.width / 2));
        player.y = Math.max(0, Math.min(canvas.height - player.height, relativeY - player.height / 2));
        e.preventDefault();
    };
    const handleTouchEnd = () => {
        isTouching = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    const spawnEnemy = () => {
      const size = 30 + Math.random() * 20;
      const speed = 2.5 + (score / 1000) * 1.2 + (frameCount / 5000) * 1.0; 
      enemies.push({
        x: Math.random() * (canvas.width - size),
        y: -size,
        width: size,
        height: size,
        speed: Math.min(speed, 12),
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        type: Math.random() > 0.7 ? 'alien' : 'meteor',
        hp: Math.random() > 0.95 ? 4 : 1,
        destroyed: false
      });
    };

    const update = () => {
      if (localGameOver) return;

      frameCount++;
      if (invincibilityFrames > 0) invincibilityFrames--;
      if (player.weaponTimer > 0) {
          player.weaponTimer--;
          if (player.weaponTimer === 0) player.weaponType = 'single';
      }
      if (screenShake > 0) screenShake *= 0.9;

      const targetY = canvas.height - 80 - currentDebrisHeight;
      // Allow vertical movement but keep the "pushed up" mechanic as a constraint
      if ((keys['ArrowUp'] || keys['w']) && player.y > 20) player.y -= player.speed;
      if ((keys['ArrowDown'] || keys['s']) && player.y < targetY) player.y += player.speed;
      
      if (player.y > targetY) player.y -= 1; 
      if (player.y < 40) { localGameOver = true; setGameOver(true); }

      if ((keys['ArrowLeft'] || keys['a']) && player.x > 0) player.x -= player.speed;
      if ((keys['ArrowRight'] || keys['d']) && player.x < canvas.width - player.width) player.x += player.speed;
      
      const shouldShoot = keys[' '] || isTouching;
      if (shouldShoot && frameCount % 8 === 0) {
        const bulletSpeed = 12;
        if (player.weaponType === 'single') {
            bullets.push({ x: player.x + player.width / 2 - 2, y: player.y, width: 4, height: 12, speedY: -bulletSpeed, speedX: 0, color: '#ff006e', type: 'normal' });
        } else if (player.weaponType === 'double') {
            bullets.push({ x: player.x, y: player.y + 10, width: 4, height: 12, speedY: -bulletSpeed, speedX: 0, color: '#00f5d4', type: 'normal' });
            bullets.push({ x: player.x + player.width - 4, y: player.y + 10, width: 4, height: 12, speedY: -bulletSpeed, speedX: 0, color: '#00f5d4', type: 'normal' });
        } else if (player.weaponType === 'triple') {
            bullets.push({ x: player.x + player.width / 2 - 2, y: player.y, width: 4, height: 12, speedY: -bulletSpeed, speedX: 0, color: '#fee440', type: 'normal' });
            bullets.push({ x: player.x, y: player.y + 10, width: 4, height: 12, speedY: -bulletSpeed, speedX: -2, color: '#fee440', type: 'normal' });
            bullets.push({ x: player.x + player.width - 4, y: player.y + 10, width: 4, height: 12, speedY: -bulletSpeed, speedX: 2, color: '#fee440', type: 'normal' });
        } else if (player.weaponType === 'fire') {
            bullets.push({ x: player.x - 15, y: player.y - 120, width: player.width + 30, height: 120, speedY: -10, speedX: 0, color: '#fb5607', type: 'fire', life: 15 });
        }
      }

      if (specialCharge >= 100 && (keys['Enter'] || (isTouching && isMobile && keys['specialActionMobile']))) {
          horizontalLightning.active = true;
          horizontalLightning.y = player.y;
          specialCharge = 0;
          screenShake = 20;
          keys['specialActionMobile'] = false;
          floatingTexts.push({ x: canvas.width/2, y: player.y - 40, text: "ULTIMATE DISCHARGE!", life: 60, color: '#00f5d4' });
      }

      if (horizontalLightning.active) {
          horizontalLightning.y -= 15;
          if (horizontalLightning.y < -50) horizontalLightning.active = false;
          enemies.forEach(e => {
              if (Math.abs(e.y - horizontalLightning.y) < 50) { e.hp = 0; e.destroyed = true; }
          });
      }

      if (frameCount % 2 === 0) {
        // Normal particles
        particles.push({
          x: player.x + player.width / 2 + (Math.random() * 6 - 3),
          y: player.y + player.height - 5,
          size: Math.random() * 6 + 2,
          speedY: Math.random() * 2 + 1,
          speedX: Math.random() * 2 - 1,
          life: 1.0,
          color: Math.random() > 0.5 ? '#64748b' : '#94a3b8'
        });
        
        // Electric ionic blast particles (blue/white lightning effect)
        for(let i = 0; i < 2; i++) {
          particles.push({
            x: player.x + player.width / 2 + (Math.random() * 10 - 5),
            y: player.y + player.height - 2,
            size: Math.random() * 4 + 1,
            speedY: Math.random() * 5 + 3,
            speedX: (Math.random() - 0.5) * 4,
            life: 1.0,
            color: Math.random() > 0.3 ? '#4cc9f0' : '#ffffff',
            type: 'ionic'
          });
        }
      }
      
      // Update planets
      planets.forEach(p => {
        p.z += p.speedZ;
        p.angle += p.orbitSpeed;
        // Move in a slight orbital path
        p.x += Math.cos(p.angle) * 0.5;
        p.y += Math.sin(p.angle) * 0.5;

        if (p.z < -500) {
          p.z = 2000;
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
        }
        if (p.z > 2500) {
          p.z = -400;
        }
      });
      particles.forEach(p => { p.y += p.speedY; p.x += p.speedX; p.life -= 0.02; p.size *= 0.98; });
      particles = particles.filter(p => p.life > 0);

      bullets.forEach(b => { 
        b.y += b.speedY; 
        if (b.speedX) b.x += b.speedX; 
        if (b.type === 'fire') b.life--; 
      });
      bullets = bullets.filter(b => b.y > -50 && b.y < canvas.height + 50 && (b.type !== 'fire' || b.life > 0));

      powerups.forEach(p => p.y += 2.5);
      powerups = powerups.filter(p => p.y < canvas.height);
      powerups.forEach(p => {
          if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) {
              player.weaponType = p.type;
              player.weaponTimer = 600; 
              p.collected = true;
              floatingTexts.push({ x: p.x, y: p.y, text: p.label, life: 60, color: p.color });
          }
      });
      powerups = powerups.filter(p => !p.collected);

      floatingTexts.forEach(t => { t.y -= 1; t.life--; });
      floatingTexts = floatingTexts.filter(t => t.life > 0);

      const spawnRate = Math.max(12, 60 - Math.floor(score / 800) * 6 - Math.floor(frameCount / 3000) * 4); 
      if (frameCount % spawnRate === 0) spawnEnemy();

      enemies.forEach(e => {
        e.y += e.speed;
        if (e.y >= canvas.height && !e.destroyed) {
            debris.push({ x: e.x, y: canvas.height - currentDebrisHeight - 10, width: e.width, height: 20, color: e.color, type: e.type, angle: Math.random() * 0.4 - 0.2 });
            currentDebrisHeight += 8;
            e.destroyed = true;
            screenShake = 5;
            specialCharge = 0;
            floatingTexts.push({ x: player.x, y: player.y - 20, text: "CHARGE RESET!", life: 40, color: '#ef4444' });
        }

        if (invincibilityFrames === 0 && player.x < e.x + e.width && player.x + player.width > e.x && player.y < e.y + e.height && player.y + player.height > e.y) {
          setLives(l => {
            if (l <= 1) { localGameOver = true; setGameOver(true); return 0; }
            invincibilityFrames = 120;
            screenShake = 15;
            return l - 1;
          });
          e.destroyed = true;
        }

        bullets.forEach((b) => {
          if (b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
            if (b.type !== 'fire') b.destroyed = true; 
            e.hp--;
            if (e.hp <= 0 && !e.destroyedByBullet) {
                e.destroyed = true; e.destroyedByBullet = true;
                setScore(prev => prev + 100);
                specialCharge = Math.min(100, specialCharge + 5);
                for (let i = 0; i < 15; i++) {
                    explosions.push({ x: e.x + e.width/2, y: e.y + e.height/2, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1.0, color: e.color, size: Math.random() * 6 + 2 });
                }
                if (Math.random() < 0.22) {
                    const pool = [{ type: 'double', label: 'DOUBLE SHOT', color: '#00f5d4' }, { type: 'triple', label: 'TRIPLE CANNON', color: '#fee440' }, { type: 'fire', label: 'FIRE BEAM', color: '#fb5607' }];
                    const s = pool[Math.floor(Math.random() * pool.length)];
                    powerups.push({ x: e.x, y: e.y, width: 24, height: 24, ...s });
                }
            }
          }
        });
      });
      enemies = enemies.filter(e => !e.destroyed);

      explosions.forEach(ex => { ex.x += ex.vx; ex.y += ex.vy; ex.life -= 0.03; });
      explosions = explosions.filter(ex => ex.life > 0);
      
      // Canvas internal UI drawing
      draw(specialCharge, frameCount);
    };

    const draw = (charge: number, frames: number) => {
      ctx.save();
      if (screenShake > 0) ctx.translate(Math.random() * screenShake - screenShake/2, Math.random() * screenShake - screenShake/2);
      ctx.clearRect(-20, -20, canvas.width+40, canvas.height+40);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for(let i=0; i<30; i++) {
          const sy = (i * 237 + frames * 0.5) % canvas.height;
          const sx = (i * 123) % canvas.width;
          ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI*2); ctx.fill();
      }

      // Draw Planets with perspective
      planets.forEach(p => {
        const perspective = 400 / (400 + p.z);
        const screenX = (p.x - canvas.width / 2) * perspective + canvas.width / 2;
        const screenY = (p.y - canvas.height / 2) * perspective + canvas.height / 2;
        const size = p.baseSize * perspective;

        if (size > 0.1) {
          ctx.save();
          ctx.translate(screenX, screenY);
          ctx.globalAlpha = Math.min(1, perspective * 2);
          
          // Planet body
          const grad = ctx.createRadialGradient(-size/3, -size/3, size/10, 0, 0, size);
          grad.addColorStop(0, p.color1);
          grad.addColorStop(1, p.color2);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();

          // Rings for Saturn-like planets
          if (p.hasRings) {
            ctx.strokeStyle = 'rgba(244, 224, 175, 0.4)';
            ctx.lineWidth = size / 4;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2.2, size * 0.6, Math.PI / 6, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }
      });

      particles.forEach(p => { 
        ctx.globalAlpha = p.life; 
        ctx.fillStyle = p.color; 
        if (p.type === 'ionic') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          // Draw a small line for ionic blast
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + (Math.random()-0.5)*4, p.y + p.size * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); 
        }
      });
      ctx.globalAlpha = 1.0;

      if (invincibilityFrames % 10 < 5) {
        const cx = player.x + player.width / 2; const cy = player.y; const w = player.width; const h = player.height;
        const aura = ctx.createRadialGradient(cx, cy + h/2, 2, cx, cy + h/2, w);
        aura.addColorStop(0, 'rgba(76, 201, 240, 0.2)'); aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura; ctx.fillRect(player.x - 10, player.y - 10, w + 20, h + 20);
        ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.bezierCurveTo(cx + w/2, cy + h/4, cx + w/2, cy + h-10, cx + w/2, cy + h-10); ctx.lineTo(cx - w/2, cy + h-10); ctx.bezierCurveTo(cx - w/2, cy + h-10, cx - w/2, cy + h/4, cx, cy); ctx.fill();
        ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.ellipse(cx, cy + h/4, w/6, h/10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(cx - w/2, cy + h/3); ctx.lineTo(cx - w, cy + h-10); ctx.lineTo(cx - w/2, cy + h-10); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + w/2, cy + h/3); ctx.lineTo(cx + w, cy + h-10); ctx.lineTo(cx + w/2, cy + h-10); ctx.fill();
        
        // Main engine core
        const engineGlow = ctx.createRadialGradient(cx, cy + h - 10, 0, cx, cy + h - 10, 20);
        engineGlow.addColorStop(0, '#fff'); engineGlow.addColorStop(0.3, '#4cc9f0'); engineGlow.addColorStop(0.6, '#4361ee'); engineGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = engineGlow; ctx.beginPath(); ctx.arc(cx, cy + h - 10, 10 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
        
        // Ionic blast flicker
        if (frames % 2 === 0) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy + h - 10);
            ctx.lineTo(cx + (Math.random()-0.5)*20, cy + h + 20 + Math.random() * 30);
            ctx.stroke();
        }
      }

      bullets.forEach(b => {
          if (b.type === 'fire') {
              const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
              grad.addColorStop(0, '#fb5607'); grad.addColorStop(0.3, '#ffbe0b'); grad.addColorStop(0.7, '#ff006e'); grad.addColorStop(1, 'transparent');
              ctx.fillStyle = grad; ctx.shadowBlur = 20; ctx.shadowColor = '#fb5607'; ctx.fillRect(b.x, b.y, b.width, b.height);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2; ctx.beginPath();
              let curX = b.x + Math.random() * b.width; let curY = b.y + b.height; ctx.moveTo(curX, curY);
              for (let i = 0; i < 6; i++) { curX += (Math.random() - 0.5) * 40; curY -= b.height / 6; ctx.lineTo(curX, curY); }
              ctx.stroke(); ctx.shadowBlur = 0;
          } else { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.width, b.height); }
      });

      powerups.forEach(p => {
          ctx.beginPath(); ctx.arc(p.x + p.width/2, p.y + p.height/2, 12, 0, Math.PI * 2);
          ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText('W', p.x + p.width/2, p.y + p.height/2 + 4);
      });

      explosions.forEach(ex => { ctx.globalAlpha = ex.life; ctx.fillStyle = ex.color; ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.size, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1.0;

      if (horizontalLightning.active) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath();
          let lx = 0; ctx.moveTo(lx, horizontalLightning.y);
          while (lx < canvas.width) { lx += 20; ctx.lineTo(lx, horizontalLightning.y + (Math.random() - 0.5) * 40); }
          ctx.shadowBlur = 30; ctx.shadowColor = '#00f5d4'; ctx.stroke(); ctx.shadowBlur = 0;
      }

      enemies.forEach(e => {
        ctx.fillStyle = e.color;
        if (e.type === 'alien') {
            ctx.beginPath(); ctx.ellipse(e.x + e.width/2, e.y + e.height/2, e.width/2, e.height/3, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(e.x + e.width/3, e.y + e.height/2, e.width/8, 0, Math.PI*2);
            ctx.arc(e.x + (e.width/3)*2, e.y + e.height/2, e.width/8, 0, Math.PI*2); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(e.x + e.width/2, e.y + e.height/2, e.width/2, 0, Math.PI*2); ctx.fill(); }
      });

      debris.forEach(d => {
          ctx.save(); ctx.translate(d.x + d.width/2, canvas.height - (canvas.height - d.y)); ctx.rotate(d.angle);
          ctx.fillStyle = d.color; ctx.globalAlpha = 0.8;
          if (d.type === 'alien') { ctx.beginPath(); ctx.ellipse(0, 0, d.width/2, d.height/2, 0, 0, Math.PI*2); ctx.fill(); }
          else { ctx.beginPath(); ctx.rect(-d.width/2, -d.height/2, d.width, d.height); ctx.fill(); }
          ctx.restore();
      });
      ctx.globalAlpha = 1.0;

      if (currentDebrisHeight > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillRect(0, canvas.height - currentDebrisHeight, canvas.width, currentDebrisHeight);
          if (currentDebrisHeight > canvas.height * 0.6) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'; ctx.fillRect(0, 0, canvas.width, 40);
              ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText("⚠️ DANGER: SPACE JUNK SATURATION", canvas.width/2, 25);
          }
      }

      if (player.weaponType !== 'single' && player.weaponTimer > 0) {
          const barWidth = 100; const bx = canvas.width - barWidth - 20; const by = 80;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillRect(bx, by, barWidth, 6);
          const colors: any = { double: '#00f5d4', triple: '#fee440', fire: '#fb5607' };
          ctx.fillStyle = colors[player.weaponType] || '#fff'; ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
          ctx.fillRect(bx, by, barWidth * (player.weaponTimer / 600), 6); ctx.shadowBlur = 0;
          ctx.font = 'bold 9px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillText(`${player.weaponType.toUpperCase()} ACTIVE`, bx + barWidth, by - 6);
      }

      const chargeWidth = 120; const cbx = 20; const cby = canvas.height - 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillRect(cbx, cby, chargeWidth, 10);
      const chargeGrad = ctx.createLinearGradient(cbx, 0, cbx + chargeWidth, 0); chargeGrad.addColorStop(0, '#00f5d4'); chargeGrad.addColorStop(1, '#0ea5e9');
      ctx.fillStyle = chargeGrad;
      if (charge >= 100) { ctx.shadowBlur = 15; ctx.shadowColor = '#00f5d4'; if (frames % 10 < 5) ctx.fillStyle = 'white'; }
      ctx.fillRect(cbx, cby, (chargeWidth * charge) / 100, 10); ctx.shadowBlur = 0;
      ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left'; ctx.fillStyle = 'white';
      ctx.fillText(charge >= 100 ? "READY! (ENTER)" : `ULTIMATE: ${Math.floor(charge)}%`, cbx, cby - 8);

      floatingTexts.forEach(t => { ctx.globalAlpha = t.life / 60; ctx.fillStyle = t.color; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText(t.text, t.x, t.y); ctx.globalAlpha = 1.0; });
      ctx.restore();
    };

    const gameLoop = () => {
      try { update(); } catch(e) { console.error('Spaceship loop error:', e); }
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    gameLoop();
    return () => { 
        window.removeEventListener('keydown', handleKeyDown); 
        window.removeEventListener('keyup', handleKeyUp); 
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        cancelAnimationFrame(animationFrameId); 
    };
  }, [isMobile]);

  useEffect(() => {
    if (gameOver) {
        if (score > highScore) { setHighScore(score); localStorage.setItem('spaceship_highscore', score.toString()); }
        onGameOver(score);
    }
  }, [gameOver, score, onGameOver]);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden border-4 border-slate-700 shadow-2xl">
        <canvas ref={canvasRef} width={400} height={600} className="w-full h-auto block bg-slate-950 touch-none" />
        <div className="absolute top-4 left-4 text-white font-bold drop-shadow-md flex flex-col gap-1 pointer-events-none">
          <p className="text-xl">Score: {score}</p>
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <span key={i} className={`text-lg transition-all ${i < lives ? 'text-red-500 scale-110' : 'text-slate-700 opacity-20 scale-90'}`}>❤️</span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-tighter">High Score: {highScore}</p>
        </div>
        {gameOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-center p-6 border-4 border-red-500/30 rounded-3xl m-4">
            <h2 className="text-4xl font-black text-red-500 mb-2 drop-shadow-lg">MISSION FAILED</h2>
            <p className="text-white text-xl mb-6">Final Score: {score}</p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
                <button onClick={() => { setScore(0); setLives(5); setGameOver(false); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-xl">Try Again</button>
                <button onClick={onBack} className="bg-slate-700 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all shadow-xl">Back to Earth</button>
            </div>
          </div>
        )}
        <button onClick={onBack} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full transition-all flex items-center gap-2 border border-white/20 backdrop-blur-md text-xs font-bold shadow-lg z-10">🏠 {language === 'am' ? 'መነሻ' : 'Home'}</button>

        {isMobile && !gameOver && (
            <div className="absolute bottom-24 right-4 flex flex-col items-center gap-4 z-10">
                {score % 100 !== 999 /* Just a dummy check to keep the UI clean if needed, but we use the condition below */ }
                <button 
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        // Use a hacky key to trigger special action
                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                    }}
                    className={`w-20 h-20 border-4 border-white text-white font-black rounded-full shadow-2xl transition-all flex items-center justify-center text-[10px] text-center p-1 uppercase ${score >= 0 ? 'bg-cyan-500/60 active:bg-cyan-400' : ''} ${gameOver ? 'hidden' : ''}`}
                    style={{ opacity: 1 /* We'll just always show it or hide based on charge if preferred */ }}
                >
                    ULTIMATE
                </button>
                <div className="text-[10px] text-white/50 font-bold bg-black/20 px-2 rounded-full backdrop-blur-sm">
                    DRAG TO MOVE • AUTO-FIRE
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default SpaceshipGame;
