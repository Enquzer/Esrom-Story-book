
import React from 'react';
import { Language } from '../types';
import { translations } from '../translations';

interface LoaderProps {
  message: string;
  language: Language;
}

const Loader: React.FC<LoaderProps> = ({ message, language }) => {
  const t = translations[language];
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl border-4 border-blue-100 max-w-md w-full">
      <div className="relative w-64 h-64 mb-6">
        <img 
          src="/logo.png" 
          alt="StorySpark Logo" 
          className="w-full h-full object-contain animate-pulse p-4"
        />
        <div className="absolute inset-0 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h2 className="text-3xl font-extrabold text-blue-600 mb-2">{t.magicInProgress}</h2>
      <p className="text-lg text-slate-600 font-medium">
        {message || t.buildingAdventure}
      </p>
    </div>
  );
};

export default Loader;
