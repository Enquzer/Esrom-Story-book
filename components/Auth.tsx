import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';

const SpaceBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#020107] z-0 pointer-events-none">
      <style>
        {`
          :root {
            --space-bg: #020107;
            --ion-glow: #00d4ff;
          }

          /* 1. Starfield */
          .auth-stars {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: #020107;
            background-image: 
              radial-gradient(1.5px 1.5px at 20px 30px, #eee, rgba(0,0,0,0)),
              radial-gradient(1.5px 1.5px at 150px 150px, #fff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 100px 300px, #ddd, rgba(0,0,0,0)),
              radial-gradient(1.5px 1.5px at 240px 100px, #fff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 300px 250px, #ddd, rgba(0,0,0,0));
            background-repeat: repeat;
            background-size: 350px 350px;
            animation: auth-drift 180s linear infinite;
            z-index: 0;
          }

          /* 2. Planetary Systems */
          .auth-orbit {
            position: absolute;
            top: 50%; left: 50%;
            border: 1px solid rgba(255, 255, 255, 0.03);
            border-radius: 50%;
            transform: translate(-50%, -50%);
          }

          .auth-planet-wrapper {
            position: absolute;
            top: 50%; left: 50%;
            width: 100%; height: 100%;
            animation: auth-rotate var(--duration) linear infinite;
          }

          .auth-planet {
            position: absolute;
            top: 0; left: 50%;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: inset -15px -15px 40px rgba(0,0,0,0.8), 0 0 30px rgba(255,255,255,0.05);
          }

          .auth-moon {
            position: absolute;
            width: 10px; height: 10px;
            background: radial-gradient(circle at 30% 30%, #ddd, #444);
            border-radius: 50%;
            top: 50%; left: 50%;
            animation: auth-rotate var(--m-duration) linear infinite;
          }

          /* 3. Detailed Space Shuttle (Smaller Scale) */
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

          .auth-shuttle-nose {
            width: 0; height: 0;
            border-left: 10px solid transparent;
            border-right: 10px solid transparent;
            border-bottom: 20px solid #e0e0e0;
          }

          .auth-shuttle-body {
            width: 20px; height: 40px;
            background: #f0f0f0;
            position: relative;
            border-radius: 2px 2px 4px 4px;
            border-bottom: 4px solid #444;
          }

          .auth-shuttle-window {
            width: 10px; height: 6px;
            background: #1a237e;
            margin: 6px auto;
            border-radius: 1px;
            border: 0.5px solid #0d47a1;
          }

          .auth-solar-panel {
            position: absolute;
            width: 30px; height: 8px;
            background: linear-gradient(45deg, #1a237e, #0d47a1);
            border: 0.5px solid #42a5f5;
            top: 15px;
            background-size: 5px 5px;
            background-image: 
              linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px);
          }
          .auth-solar-left { right: 100%; border-radius: 2px 0 0 2px; }
          .auth-solar-right { left: 100%; border-radius: 0 2px 2px 0; }

          .auth-shuttle-engine {
            width: 14px; height: 5px;
            background: #fff;
            border-radius: 50%;
            filter: blur(2px);
            box-shadow: 
              0 0 10px #fff,
              0 5px 20px var(--ion-glow),
              0 15px 40px var(--ion-glow);
            animation: auth-flicker-v 0.1s infinite alternate;
          }

          /* Animations */
          @keyframes auth-drift {
            from { transform: translate(0, 0); }
            to { transform: translate(-50%, -50%); }
          }

          @keyframes auth-rotate {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }

          @keyframes auth-shuttle-launch {
            0% { transform: translateY(0) scale(0.6); bottom: -200px; opacity: 0; }
            5% { opacity: 1; }
            45% { transform: translateY(-50vh) scale(0.8) rotate(3deg); }
            100% { transform: translateY(-130vh) scale(1.1) rotate(-2deg); bottom: 100%; }
          }

          @keyframes auth-flicker-v {
            0% { opacity: 0.8; transform: scaleX(0.9); }
            100% { opacity: 1; transform: scaleX(1.1); box-shadow: 0 0 30px var(--ion-glow); }
          }

          .auth-welcome-text {
             animation: auth-fade-in-out 4s ease-in-out infinite;
          }

          @keyframes auth-fade-in-out {
            0%, 100% { opacity: 0; transform: translateY(10px); }
            20%, 80% { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
      
      <div className="auth-stars"></div>
      
      {/* 1. Large Magma Planet (Tight Orbit) */}
      <div className="auth-orbit w-[45vmin] h-[45vmin]" style={{"--duration": "45s"} as any}>
        <div className="auth-planet-wrapper">
          <div className="auth-planet w-24 h-24 md:w-32 md:h-32" style={{
            background: 'radial-gradient(circle at 30% 30%, #ff8a65, #bf360c)',
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(0,0,0,0.1) 15px, rgba(0,0,0,0.1) 30px)'
          }} />
        </div>
      </div>

      {/* 2. Giant Gas Giant with Moon (Middle Orbit) */}
      <div className="auth-orbit w-[85vmin] h-[85vmin]" style={{"--duration": "80s"} as any}>
        <div className="auth-planet-wrapper">
          <div className="auth-planet w-40 h-40 md:w-64 md:h-64" style={{
            background: 'radial-gradient(circle at 30% 30%, #4fc3f7, #01579b)',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 2px, transparent 2px)',
            backgroundSize: '100% 20px'
          }}>
             <div className="auth-moon" style={{
               "--m-duration": "10s",
               "transform": "translateX(160px)"
             } as any} />
          </div>
        </div>
      </div>

      {/* 3. Small Distance Moons/Small Planet (Outer Orbit) */}
      <div className="auth-orbit w-[120vmin] h-[120vmin]" style={{"--duration": "150s"} as any}>
        <div className="auth-planet-wrapper">
          <div className="auth-planet w-12 h-12 md:w-16 md:h-16" style={{
            background: 'radial-gradient(circle at 30% 30%, #e1f5fe, #0277bd)',
            boxShadow: 'inset 0 0 15px rgba(255,255,255,0.4)'
          }} />
        </div>
      </div>

      {/* 4. Large Ring/Atmospheric Planet (Deep Orbit) */}
      <div className="auth-orbit w-[160vmin] h-[160vmin]" style={{"--duration": "240s"} as any}>
        <div className="auth-planet-wrapper">
          <div className="auth-planet w-32 h-32 md:w-48 md:h-48" style={{
            background: 'radial-gradient(circle at 30% 30%, #8e24aa, #4a148c)',
            boxShadow: '0 0 50px rgba(142, 36, 170, 0.3)'
          }}>
             <div className="absolute inset-x-0 top-1/2 h-1 bg-white/10 blur-[2px] transform -rotate-12" />
          </div>
        </div>
      </div>
      
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 z-50 absolute inset-0 overflow-hidden">
      <SpaceBackground />
      <div className="bg-slate-800/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-md w-full z-10 border border-slate-700">
        <div className="flex justify-center mb-6">
          <img 
            src="/logo.png" 
            alt="StorySpark Logo" 
            className="w-48 h-auto object-contain drop-shadow-2xl"
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
            className="p-3 rounded-xl bg-slate-700/80 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-xl bg-slate-700/80 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-white"
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
