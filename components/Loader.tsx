
import React from 'react';

const RocketIcon = () => (
  <svg className="w-16 h-16 text-blue-500 animate-bounce" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a6 6 0 01-5.84 7.38v-4.82m-5.84 2.56a6 6 0 015.84-7.38m-5.84 7.38a6 6 0 015.84-7.38m0-11.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 18.75c.273 0 .53.03.78.082m15.09 0c.25-.052.507-.082.78-.082s.528.03.78.082m-1.956 1.45a.75.75 0 01-.541-.261L15.39 18.2a1.5 1.5 0 00-2.628 0l-1.42 2.13a.75.75 0 01-.541.26z" />
  </svg>
);

interface LoaderProps {
  message: string;
}

const Loader: React.FC<LoaderProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-lg shadow-lg">
      <RocketIcon />
      <h2 className="text-2xl font-bold text-slate-700 mt-6">Hang on tight!</h2>
      <p className="text-lg text-slate-500 mt-2 transition-opacity duration-500">
        {message || 'Building your adventure...'}
      </p>
    </div>
  );
};

export default Loader;
