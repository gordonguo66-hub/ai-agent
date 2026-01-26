-- User Profiles Enhancement Migration
-- Adds display_name, avatar_url, bio, gender, age to profiles
-- Creates profile_posts, profile_post_media, profile_post_replies tables
-- Sets up storage buckets for avatars and post-media

-- ============================================================================
-- STEP 1: Enhance existing profiles table
-- ============================================================================

-- Add new columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add constraints
ALTER TABLE profiles ADD CONSTRAINT gender_max_length CHECK (char_length(gender) <= 32);
ALTER TABLE profiles ADD CONSTRAINT age_valid_range CHECK (age IS NULL OR (age > 0 AND age < 120));

-- Set display_name to username for existing profiles (if username exists)
UPDATE profiles
SET display_name = COALESCE(username, 'User ' || substring(id::text, 1, 8))
WHERE display_name IS NULL;

-- Make display_name NOT NULL going forward
ALTER TABLE profiles ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN display_name SET DEFAULT 'New User';

-- Create trigger to update updated_at on profile changes
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- Update handle_new_user function to set display_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1),
      'User ' || substring(NEW.id::text, 1, 8)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Create profile_posts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_posts_author_created
  ON profile_posts(author_id, created_at DESC);

-- ============================================================================
-- STEP 3: Create profile_post_media table
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_post_media_post
  ON profile_post_media(post_id);

-- ============================================================================
-- STEP 4: Create profile_post_replies table
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_post_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_post_replies_post_created
  ON profile_post_replies(post_id, created_at ASC);

-- ============================================================================
-- STEP 5: Enable RLS on new tables
-- ============================================================================

ALTER TABLE profile_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_post_replies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: RLS Policies for profile_posts
-- ============================================================================

-- Everyone can read profile posts
CREATE POLICY "Everyone can read profile posts"
  ON profile_posts FOR SELECT
  USING (true);

-- Users can insert their own posts
CREATE POLICY "Users can insert own profile posts"
  ON profile_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Users can update their own posts
CREATE POLICY "Users can update own profile posts"
  ON profile_posts FOR UPDATE
  USING (auth.uid() = author_id);

-- Users can delete their own posts
CREATE POLICY "Users can delete own profile posts"
  ON profile_posts FOR DELETE
  USING (auth.uid() = author_id);

-- ============================================================================
-- STEP 7: RLS Policies for profile_post_media
-- ============================================================================

-- Everyone can read media
CREATE POLICY "Everyone can read profile post media"
  ON profile_post_media FOR SELECT
  USING (true);

-- Users can insert media for their own posts
CREATE POLICY "Users can insert media for own posts"
  ON profile_post_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profile_posts
      WHERE id = post_id AND author_id = auth.uid()
    )
  );

-- Users can delete media for their own posts
CREATE POLICY "Users can delete media for own posts"
  ON profile_post_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profile_posts
      WHERE id = post_id AND author_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 8: RLS Policies for profile_post_replies
-- ============================================================================

-- Everyone can read replies
CREATE POLICY "Everyone can read profile post replies"
  ON profile_post_replies FOR SELECT
  USING (true);

-- Users can insert their own replies
CREATE POLICY "Users can insert own profile post replies"
  ON profile_post_replies FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Users can delete their own replies
CREATE POLICY "Users can delete own profile post replies"
  ON profile_post_replies FOR DELETE
  USING (auth.uid() = author_id);

-- ============================================================================
-- STEP 9: Storage Buckets (run separately in Supabase dashboard or via API)
-- ============================================================================
-- Note: Storage bucket creation typically requires dashboard or service role.
-- Run these commands in the Supabase SQL editor or via the dashboard:

-- CREATE STORAGE BUCKET 'avatars' (public);
-- CREATE STORAGE BUCKET 'post-media' (public);

-- Storage policies for avatars bucket:
-- INSERT: authenticated users can upload to their own folder (user_id/*)
-- SELECT: public access
-- DELETE: authenticated users can delete their own files

-- Storage policies for post-media bucket:
-- INSERT: authenticated users can upload
-- SELECT: public access
-- DELETE: authenticated users can delete their own files

-- ============================================================================
-- STEP 10: Grant service role access for the new tables
-- ============================================================================

-- These allow the service role client to bypass RLS when needed
GRANT ALL ON profile_posts TO service_role;
GRANT ALL ON profile_post_media TO service_role;
GRANT ALL ON profile_post_replies TO service_role;
