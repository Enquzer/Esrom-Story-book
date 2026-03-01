import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';
import logo from '../logo.png';

const SpaceBackground = () => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const planetColors = [
      ['#ff8a65', '#bf360c'], ['#4fc3f7', '#01579b'],
      ['#81c784', '#1b5e20'], ['#ba68c8', '#4a148c'],
      ['#ffd54f', '#f57f17'], ['#e0e0e0', '#424242']
    ];

    class Particle {
      x: number; y: number; vx: number; vy: number;
      life: number; color: string; size: number;
      constructor(x: number, y: number, color: string) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.color = color;
        this.size = Math.random() * 3 + 1;
      }
      update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.02;
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    class Sun {
      x: number; y: number; radius: number; mass: number;
      constructor() {
        this.x = width / 2;
        this.y = height / 2;
        this.radius = 45;
        this.mass = 2000;
      }
      draw(ctx: CanvasRenderingContext2D) {
        const grad = ctx.createRadialGradient(this.x, this.y, 5, this.x, this.y, this.radius);
        grad.addColorStop(0, '#fffde7');
        grad.addColorStop(0.3, '#ffeb3b');
        grad.addColorStop(0.7, '#f57f17');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = '#fff7bc';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#f57f17';
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    class Planet {
      x: number; y: number; vx: number; vy: number;
      radius: number; mass: number;
      color1: string; color2: string;
      moons: any[]; hasRing: boolean; ringAngle: number;
      angle: number;
      isOffScreen: boolean = false;

      constructor() {
        this.radius = 12 + Math.random() * 20;
        this.mass = this.radius * 3;
        // Spawn near edges or random
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        // Tangential velocity for semi-stable orbits initially
        const dx = this.x - width / 2;
        const dy = this.y - height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 2 + Math.random() * 2;
        this.vx = (-dy / dist) * speed + (Math.random() - 0.5);
        this.vy = (dx / dist) * speed + (Math.random() - 0.5);

        const colors = planetColors[Math.floor(Math.random() * planetColors.length)];
        this.color1 = colors[0];
        this.color2 = colors[1];
        this.hasRing = Math.random() > 0.7;
        this.ringAngle = Math.random() * Math.PI;
        this.angle = 0;
        this.moons = Array.from({ length: Math.floor(Math.random() * 3) }, () => ({
          dist: this.radius + 15 + Math.random() * 20,
          speed: 0.005 + Math.random() * 0.015, // SLOWER MOONS
          angle: Math.random() * Math.PI * 2,
          size: 3 + Math.random() * 3,
          color: '#ddd'
        }));
      }

      update(planets: Planet[], sun: Sun) {
        const G = 0.5;
        
        // Gravity from Sun
        const sdx = sun.x - this.x;
        const sdy = sun.y - this.y;
        const sDistSq = sdx * sdx + sdy * sdy;
        const sDist = Math.sqrt(sDistSq);
        const sForce = (G * this.mass * sun.mass) / Math.max(sDistSq, 1000);
        this.vx += (sdx / sDist) * (sForce / this.mass);
        this.vy += (sdy / sDist) * (sForce / this.mass);

        // N-body gravity
        planets.forEach(other => {
          if (other === this) return;
          const dx = other.x - this.x;
          const dy = other.y - this.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          if (dist < 1) return;
          const force = (G * this.mass * other.mass) / Math.max(distSq, 500);
          this.vx += (dx / dist) * (force / this.mass);
          this.vy += (dy / dist) * (force / this.mass);
        });

        this.x += this.vx;
        this.y += this.vy;
        this.angle += 0.01;

        // Memory Management: Delete if far off screen
        const margin = 200;
        if (this.x < -margin || this.x > width + margin || 
            this.y < -margin || this.y > height + margin) {
          this.isOffScreen = true;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        this.moons.forEach(m => {
          m.angle += m.speed;
          const mx = this.x + Math.cos(m.angle) * m.dist;
          const my = this.y + Math.sin(m.angle) * m.dist;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          ctx.arc(mx, my, m.size, 0, Math.PI * 2);
          ctx.fill();
        });

        const grad = ctx.createRadialGradient(this.x - this.radius/3, this.y - this.radius/3, this.radius/10, this.x, this.y, this.radius);
        grad.addColorStop(0, this.color1);
        grad.addColorStop(1, this.color2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        if (this.hasRing) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(this.x, this.y, this.radius * 2.2, this.radius * 0.4, this.ringAngle, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    const sun = new Sun();
    let planets = Array.from({ length: 6 }, () => new Planet());
    let particles: Particle[] = [];

    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.5 + 0.3
    }));

    const animate = () => {
      ctx.fillStyle = '#020107';
      ctx.fillRect(0, 0, width, height);

      stars.forEach(s => {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.size, 0, Math.PI * 2);
        ctx.fill();
      });

      sun.draw(ctx);

      // Filter off-screen planets
      planets = planets.filter(p => !p.isOffScreen);
      
      // Respawn if too few
      if (planets.length < 4) {
        const newP = new Planet();
        // Force spawn near edges so they fly in
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { newP.x = -50; newP.y = Math.random() * height; }
        else if (side === 1) { newP.x = width + 50; newP.y = Math.random() * height; }
        else if (side === 2) { newP.y = -50; newP.x = Math.random() * width; }
        else { newP.y = height + 50; newP.x = Math.random() * width; }
        planets.push(newP);
      }

      planets.forEach((p, i) => {
        p.update(planets, sun);
        p.draw(ctx);
        
        for (let j = i + 1; j < planets.length; j++) {
          const other = planets[j];
          const dx = other.x - p.x;
          const dy = other.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < p.radius + other.radius) {
            setFlash(true);
            setTimeout(() => setFlash(false), 80);
            for(let k=0; k<15; k++) particles.push(new Particle(p.x + dx/2, p.y + dy/2, p.color1));
            const angle = Math.atan2(dy, dx);
            const targetX = p.x + Math.cos(angle) * (p.radius + other.radius);
            const targetY = p.y + Math.sin(angle) * (p.radius + other.radius);
            const ax = (targetX - other.x) * 0.15;
            const ay = (targetY - other.y) * 0.15;
            p.vx -= ax; p.vy -= ay;
            other.vx += ax; other.vy += ay;
          }
        }
      });

      // Update & Draw Debris
      particles = particles.filter(p => p.life > 0);
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#020107] z-0 pointer-events-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
      {flash && <div className="absolute inset-0 bg-white z-50 opacity-40 transition-opacity" />}
      <style>
        {`
          .auth-stars {
            display: none; /* Replaced by Canvas stars */
          }
          .auth-shuttle {
            position: absolute;
            left: 10%; bottom: -200px;
            width: 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: auth-shuttle-launch 20s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            z-index: 10;
          }
          .auth-shuttle-nose {width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 20px solid #e0e0e0;}
          .auth-shuttle-body {width: 20px; height: 40px; background: #f0f0f0; position: relative; border-radius: 2px 2px 4px 4px; border-bottom: 4px solid #444;}
          .auth-shuttle-window {width: 10px; height: 6px; background: #1a237e; margin: 6px auto; border-radius: 1px; border: 0.5px solid #0d47a1;}
          .auth-solar-panel {position: absolute; width: 30px; height: 8px; background: linear-gradient(45deg, #1a237e, #0d47a1); border: 0.5px solid #42a5f5; top: 15px; background-size: 5px 5px; background-image: linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px);}
          .auth-solar-left { right: 100%; border-radius: 2px 0 0 2px; }
          .auth-solar-right { left: 100%; border-radius: 0 2px 2px 0; }
          .auth-shuttle-engine {width: 14px; height: 5px; background: #fff; border-radius: 50%; filter: blur(2px); box-shadow: 0 0 10px #fff, 0 5px 20px #00d4ff, 0 15px 40px #00d4ff; animation: auth-flicker-v 0.1s infinite alternate;}
          @keyframes auth-shuttle-launch {
            0% { transform: translateY(0) scale(0.6); bottom: -200px; opacity: 0; }
            5% { opacity: 1; }
            45% { transform: translateY(-50vh) scale(0.8) rotate(3deg); }
            100% { transform: translateY(-130vh) scale(1.1) rotate(-2deg); bottom: 100%; }
          }
          @keyframes auth-flicker-v { 0% { opacity: 0.8; transform: scaleX(0.9); } 100% { opacity: 1; transform: scaleX(1.1); box-shadow: 0 0 30px #00d4ff; } }
          .auth-welcome-text { animation: auth-fade-in-out 4s ease-in-out infinite; }
          @keyframes auth-fade-in-out { 0%, 100% { opacity: 0; transform: translateY(10px); } 20%, 80% { opacity: 1; transform: translateY(0); } }
        `}
      </style>
      
      {/* Small Vertical Shuttle */}
      <div className="auth-shuttle">
        <div className="auth-shuttle-nose"></div>
        <div className="auth-shuttle-body">
          <div className="auth-shuttle-window"></div>
          <div className="auth-solar-panel auth-solar-left"></div>
          <div className="auth-solar-panel auth-solar-right"></div>
        </div>
        <div className="auth-shuttle-engine"></div>
      </div>

      <div className="absolute w-full text-center top-[45%] text-white z-20 tracking-[10px] uppercase pointer-events-none">
        <h1 className="auth-welcome-text text-xl md:text-3xl font-light drop-shadow-[0_0_20px_rgba(0,212,255,0.5)]">
          Initiating Systems
        </h1>
      </div>
    </div>
  );
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert('Check your email for the login link!');
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-white p-4 z-50 absolute inset-0 overflow-hidden">
      <SpaceBackground />
      <div className="bg-slate-900/30 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-md w-full z-10 border border-white/10">
        <div className="flex justify-center mb-6 drop-shadow-2xl">
          <img 
            src={logo} 
            alt="StorySpark Logo" 
            className="w-full max-w-72 h-auto object-contain mx-auto"
            onError={(e) => {
              console.error("Auth logo load failed", e);
            }}
          />
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-6">
          {mode === 'login' ? 'Welcome Back!' : 'Create an Account'}
        </h2>

        <form className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder:text-slate-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white placeholder:text-slate-500"
          />
          
          <button
            onClick={mode === 'login' ? handleLogin : handleSignUp}
            disabled={loading}
            className={`w-full mt-4 font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 ${
              mode === 'login' 
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30' 
                : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
            }`}
          >
            {loading ? 'Processing...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>

          <p className="text-center text-sm text-slate-400 mt-2">
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-blue-400 hover:underline font-bold"
            >
              {mode === 'login' ? 'Sign Up' : 'Log In'}
            </button>
          </p>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-700"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-800 px-2 text-slate-400">Or continue with</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </button>
        </form>
      </div>
    </div>
  );
}
