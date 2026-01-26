-- Likes Feature Migration
-- Adds like tables for both profile posts and community posts
-- Also adds post_media table for community post images

-- ============================================================================
-- STEP 1: Create profile_post_likes table
-- ============================================================================

CREATE TABLE IF NOT EXISTS profile_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- Each user can only like a post once
);

CREATE INDEX IF NOT EXISTS idx_profile_post_likes_post ON profile_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_profile_post_likes_user ON profile_post_likes(user_id);

-- ============================================================================
-- STEP 2: Create post_likes table (for community posts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- Each user can only like a post once
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

-- ============================================================================
-- STEP 3: Add likes_count columns for efficient queries
-- ============================================================================

ALTER TABLE profile_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- ============================================================================
-- STEP 4: Enable RLS on like tables
-- ============================================================================

ALTER TABLE profile_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 5: RLS Policies for profile_post_likes
-- ============================================================================

DROP POLICY IF EXISTS "Everyone can read profile post likes" ON profile_post_likes;
CREATE POLICY "Everyone can read profile post likes"
  ON profile_post_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like profile posts" ON profile_post_likes;
CREATE POLICY "Users can like profile posts"
  ON profile_post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike profile posts" ON profile_post_likes;
CREATE POLICY "Users can unlike profile posts"
  ON profile_post_likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 6: RLS Policies for post_likes (community)
-- ============================================================================

DROP POLICY IF EXISTS "Everyone can read post likes" ON post_likes;
CREATE POLICY "Everyone can read post likes"
  ON post_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like posts" ON post_likes;
CREATE POLICY "Users can like posts"
  ON post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike posts" ON post_likes;
CREATE POLICY "Users can unlike posts"
  ON post_likes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 7: Triggers to update likes_count
-- ============================================================================

-- Function to update profile_posts likes_count
CREATE OR REPLACE FUNCTION update_profile_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profile_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profile_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profile_post_likes_count_trigger ON profile_post_likes;
CREATE TRIGGER profile_post_likes_count_trigger
  AFTER INSERT OR DELETE ON profile_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_post_likes_count();

-- Function to update posts likes_count (community)
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS post_likes_count_trigger ON post_likes;
CREATE TRIGGER post_likes_count_trigger
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_likes_count();

-- ============================================================================
-- STEP 8: Create post_media table (for community post images)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id);

ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read post media" ON post_media;
CREATE POLICY "Everyone can read post media"
  ON post_media FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can add post media" ON post_media;
CREATE POLICY "Users can add post media"
  ON post_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = post_id AND posts.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own post media" ON post_media;
CREATE POLICY "Users can delete own post media"
  ON post_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = post_id AND posts.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 9: Grant permissions
-- ============================================================================

GRANT ALL ON profile_post_likes TO service_role;
GRANT ALL ON post_likes TO service_role;
GRANT ALL ON post_media TO service_role;
GRANT SELECT, INSERT, DELETE ON profile_post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON post_media TO authenticated;
