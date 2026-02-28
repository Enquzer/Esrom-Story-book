import React from 'react';
import { SavedStory, Language } from '../types';
import { translations } from '../translations';

interface SavedStoriesProps {
  stories: SavedStory[];
  onLoad: (story: SavedStory) => void;
  onDelete: (id: string) => void;
  language: Language;
}

const SavedStories: React.FC<SavedStoriesProps> = ({ stories, onLoad, onDelete, language }) => {
    const t = translations[language];
    return (
        <div className="w-full max-w-4xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-center text-slate-800 tracking-tight">{t.yourLibrary}</h2>
            {stories.length === 0 ? (
                <p className="text-center text-slate-500 py-8">{t.noAdventures}</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stories.map(story => (
                        <div key={story.id} className="bg-slate-50 rounded-lg shadow-md p-4 flex flex-col justify-between">
                            <div>
                                {story.characterImage && <img src={story.characterImage} alt={story.character.name} className="w-full h-40 object-cover rounded-md mb-4" />}
                                <h3 className="text-xl font-bold text-slate-700">{story.title}</h3>
                                <p className="text-sm text-slate-500">{story.character.name}</p>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => onLoad(story)} className="flex-grow bg-green-500 text-white font-semibold py-2 px-4 rounded hover:bg-green-600">{t.readAgain}</button>
                                <button onClick={() => onDelete(story.id)} className="bg-red-500 text-white font-semibold py-2 px-4 rounded hover:bg-red-600">{t.delete}</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SavedStories;