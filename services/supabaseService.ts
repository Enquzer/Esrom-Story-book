import { supabase } from './supabaseClient';
import { Page, Character, Language } from '../types';

// 1. Database Schema Setup (SQL snippet for the user)
/*
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  theme TEXT,
  cover_url TEXT
);

CREATE TABLE pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT
);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stories" ON stories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own stories" ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view pages of their stories" ON pages FOR SELECT USING (EXISTS (SELECT 1 FROM stories WHERE stories.id = pages.story_id AND stories.user_id = auth.uid()));
CREATE POLICY "Users can insert pages for their stories" ON pages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM stories WHERE stories.id = pages.story_id AND stories.user_id = auth.uid()));
*/

// Helper to compress image (already in App.tsx, but we can use it here)
async function compressImage(base64: string, maxWidth = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob failed'));
      }, 'image/webp', 0.7);
    };
    img.onerror = () => reject(new Error('Image load failed'));
  });
}

// 2. Image Upload Logic (Storage)
export async function uploadStoryImage(base64Image: string, fileName: string): Promise<string> {
  try {
    const blob = await compressImage(base64Image);
    const { data, error } = await supabase.storage
      .from('story-images')
      .upload(`public/${fileName}.webp`, blob, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('story-images')
      .getPublicUrl(`public/${fileName}.webp`);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

// 3. The "Save Story" Sequence
export async function saveStoryToSupabase(
  title: string,
  theme: string,
  pages: Page[],
  coverBase64?: string
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error('User not authenticated');
  }

  const userId = userData.user.id;
  let coverUrl = null;

  if (coverBase64) {
    coverUrl = await uploadStoryImage(coverBase64, `cover_${Date.now()}`);
  }

  // Insert story
  const { data: storyData, error: storyError } = await supabase
    .from('stories')
    .insert([
      { user_id: userId, title, theme, cover_url: coverUrl }
    ])
    .select()
    .single();

  if (storyError) throw storyError;

  const storyId = storyData.id;

  // Upload images and prepare pages data
  const pagesData = await Promise.all(
    pages.map(async (page, index) => {
      let imageUrl = null;
      if (page.imageUrl && page.imageUrl.startsWith('data:image')) {
        imageUrl = await uploadStoryImage(page.imageUrl, `page_${storyId}_${index}`);
      } else {
        imageUrl = page.imageUrl;
      }

      return {
        story_id: storyId,
        page_number: index + 1,
        content: page.pageText,
        image_url: imageUrl,
      };
    })
  );

  // Insert all pages in a single call
  const { error: pagesError } = await supabase
    .from('pages')
    .insert(pagesData);

  if (pagesError) {
    // Rollback story if pages fail? Optional but good practice.
    await supabase.from('stories').delete().eq('id', storyId);
    throw pagesError;
  }

  return storyData;
}

// 4. Fetching the Book
export async function getStoryById(storyId: string) {
  const { data, error } = await supabase
    .from('stories')
    .select('*, pages(*)')
    .eq('id', storyId)
    .single();

  if (error) throw error;
  
  // Sort pages by page_number
  if (data && data.pages) {
    data.pages.sort((a: any, b: any) => a.page_number - b.page_number);
  }
  
  return data;
}

export async function getUserStories() {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// 5. High Scores
export async function getHighScores() {
  const { data, error } = await supabase
    .from('high_scores')
    .select('user_email, game_id, score')
    .order('score', { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateHighScore(gameId: string, score: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Fetch current high score
  const { data: current, error: fetchError } = await supabase
    .from('high_scores')
    .select('score')
    .eq('user_id', user.id)
    .eq('game_id', gameId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error checking high score:", fetchError.message);
    return false;
  }

  if (!current || score > current.score) {
    console.log(`Syncing ${gameId} score to cloud: ${score}`);
    const { error: upsertError } = await supabase
      .from('high_scores')
      .upsert({
        user_id: user.id,
        user_email: user.email,
        game_id: gameId,
        score: score,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,game_id' });
    
    if (upsertError) {
      console.error("Error saving high score to Supabase:", upsertError.message);
      return false;
    }
    return true; // New high score
  }
  return false;
}
