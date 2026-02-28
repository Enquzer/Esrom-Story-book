import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 z-50 absolute inset-0">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full">
        <h2 className="text-3xl font-bold mb-6 text-center text-blue-400">Welcome to StorySpark</h2>
        <form className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 rounded bg-slate-700 border border-slate-600 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex gap-4 mt-4">
            <button
              onClick={handleLogin}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Log In
            </button>
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
