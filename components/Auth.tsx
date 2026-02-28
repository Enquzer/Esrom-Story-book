import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';

const SpaceBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-900 z-0 pointer-events-none">
      <style>
        {`
          @keyframes fly {
            0% { transform: translate(-150px, 110vh) rotate(45deg); }
            100% { transform: translate(110vw, -150px) rotate(45deg); }
          }
          @keyframes fly2 {
            0% { transform: translate(110vw, 80vh) rotate(-45deg) scale(0.6); }
            100% { transform: translate(-150px, -20vh) rotate(-45deg) scale(0.6); }
          }
          @keyframes galaxy-rotate {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }
          @keyframes galaxy-rotate-reverse {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(-360deg); }
          }
          @keyframes orbit-center {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes orbit-center-reverse {
            from { transform: rotate(0deg); }
            to { transform: rotate(-360deg); }
          }
          .stars-bg-1 {
            background-image: 
              radial-gradient(2px 2px at 20px 30px, #eee, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 40px 70px, #fff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 50px 160px, #ddd, rgba(0,0,0,0));
            background-repeat: repeat;
            background-size: 200px 200px;
          }
          .stars-bg-2 {
            background-image: 
              radial-gradient(2px 2px at 90px 40px, #fff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 130px 80px, #fff, rgba(0,0,0,0)),
              radial-gradient(2px 2px at 160px 120px, #ddd, rgba(0,0,0,0));
            background-repeat: repeat;
            background-size: 300px 300px;
          }
        `}
      </style>
      
      {/* Stars - Rotating Galaxy */}
      <div className="absolute top-1/2 left-1/2 w-[300vw] h-[300vh] stars-bg-1" style={{ animation: 'galaxy-rotate 200s linear infinite' }} />
      <div className="absolute top-1/2 left-1/2 w-[300vw] h-[300vh] stars-bg-2" style={{ animation: 'galaxy-rotate-reverse 250s linear infinite' }} />
      
      {/* Central Sun/Galaxy Core Glow */}
      <div className="absolute top-1/2 left-1/2 w-32 h-32 -ml-16 -mt-16 rounded-full opacity-20 blur-3xl bg-blue-500" />

      {/* Planet 1 System (Inner) */}
      <div className="absolute top-1/2 left-1/2" style={{ animation: 'orbit-center 25s linear infinite' }}>
        <div className="absolute" style={{ transform: 'translateX(25vmin)' }}>
           {/* Planet 1 */}
           <div className="w-16 h-16 md:w-24 md:h-24 rounded-full -ml-8 -mt-8 md:-ml-12 md:-mt-12" style={{
             background: 'linear-gradient(45deg, #FF6B6B, #4ECDC4)',
             boxShadow: 'inset -10px -10px 20px rgba(0,0,0,0.5), 0 0 20px rgba(78,205,196,0.4)',
             animation: 'orbit-center-reverse 25s linear infinite'
           }} />
        </div>
      </div>

      {/* Planet 2 System (Middle) with a moon (Cycloidal/Epicyclic) */}
      <div className="absolute top-1/2 left-1/2" style={{ animation: 'orbit-center 45s linear infinite' }}>
        <div className="absolute" style={{ transform: 'translateX(40vmin)' }}>
           {/* Planet 2 */}
           <div className="w-24 h-24 md:w-32 md:h-32 rounded-full -ml-12 -mt-12 md:-ml-16 md:-mt-16" style={{
             background: 'linear-gradient(45deg, #45B7D1, #2C3E50)',
             boxShadow: 'inset -15px -15px 30px rgba(0,0,0,0.6), 0 0 30px rgba(69,183,209,0.3)',
             animation: 'orbit-center-reverse 45s linear infinite'
           }} />
           {/* Moon orbiting Planet 2 */}
           <div className="absolute top-0 left-0" style={{ animation: 'orbit-center 10s linear infinite' }}>
             <div className="w-6 h-6 md:w-8 md:h-8 rounded-full -ml-3 -mt-3 md:-ml-4 md:-mt-4" style={{
               transform: 'translateX(12vmin)',
               background: 'linear-gradient(45deg, #FDCB6E, #E17055)',
               boxShadow: 'inset -2px -2px 5px rgba(0,0,0,0.5)'
             }} />
           </div>
        </div>
      </div>

      {/* Planet 3 System (Outer) */}
      <div className="absolute top-1/2 left-1/2" style={{ animation: 'orbit-center 70s linear infinite' }}>
        <div className="absolute" style={{ transform: 'translateX(60vmin)' }}>
           {/* Planet 3 */}
           <div className="w-12 h-12 md:w-16 md:h-16 rounded-full -ml-6 -mt-6 md:-ml-8 md:-mt-8" style={{
             background: 'linear-gradient(45deg, #A8E6CF, #3D84A8)',
             boxShadow: 'inset -5px -5px 10px rgba(0,0,0,0.5)',
             animation: 'orbit-center-reverse 70s linear infinite'
           }} />
        </div>
      </div>

      {/* Moving Spaceship 1 */}
      <svg className="absolute w-24 h-24 md:w-32 md:h-32" style={{ animation: 'fly 20s linear infinite' }} viewBox="0 0 100 100">
        <g transform="rotate(45 50 50)">
          <path d="M 50 10 C 30 30, 30 70, 50 90 C 70 70, 70 30, 50 10 Z" fill="#E0E0E0" stroke="#B0B0B0" strokeWidth="2"/>
          <circle cx="50" cy="40" r="10" fill="#80D8FF" stroke="#404040" strokeWidth="1"/>
          <path d="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" fill="#FF4500">
            <animate attributeName="d" values="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z; M 40 90 C 45 110, 55 110, 60 90 C 55 100, 45 100, 40 90 Z; M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" dur="0.3s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>

      {/* Moving Spaceship 2 */}
      <svg className="absolute w-20 h-20" style={{ animation: 'fly2 25s linear infinite 5s' }} viewBox="0 0 100 100">
        <g transform="rotate(45 50 50)">
          <path d="M 50 10 C 30 30, 30 70, 50 90 C 70 70, 70 30, 50 10 Z" fill="#FFD700" stroke="#DAA520" strokeWidth="2"/>
          <circle cx="50" cy="40" r="10" fill="#80D8FF" stroke="#404040" strokeWidth="1"/>
          <path d="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" fill="#FF4500">
            <animate attributeName="d" values="M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z; M 40 90 C 45 110, 55 110, 60 90 C 55 100, 45 100, 40 90 Z; M 40 90 C 45 100, 55 100, 60 90 C 55 95, 45 95, 40 90 Z" dur="0.3s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    </div>
  );
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  if (user) {
    return (
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => supabase.auth.signOut()}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-full shadow-lg"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 z-50 absolute inset-0 overflow-hidden">
      <SpaceBackground />
      <div className="bg-slate-800/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-md w-full z-10 border border-slate-700">
        <div className="flex justify-center mb-6">
          <img 
            src="https://storage.googleapis.com/applet-assets/storyspark-logo.png" 
            alt="StorySpark Logo" 
            className="w-48 h-auto object-contain drop-shadow-2xl"
            referrerPolicy="no-referrer"
          />
        </div>
        <form className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded-xl bg-slate-700/80 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded-xl bg-slate-700/80 border border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
          <div className="flex gap-4 mt-4">
            <button
              onClick={handleLogin}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 active:scale-95"
            >
              Log In
            </button>
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-purple-600/30 active:scale-95"
            >
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
