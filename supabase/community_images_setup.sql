-- ============================================================================
-- COMMUNITY IMAGES SETUP
-- Run this in Supabase SQL Editor to enable image uploads for community posts
-- ============================================================================

-- ============================================================================
-- STEP 1: Create post_media table
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id);

-- ============================================================================
-- STEP 2: Enable RLS on post_media
-- ============================================================================

ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read post media" ON post_media;
CREATE POLICY "Everyone can read post media"
  ON post_media FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert post media" ON post_media;
CREATE POLICY "Authenticated users can insert post media"
  ON post_media FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete own post media" ON post_media;
CREATE POLICY "Users can delete own post media"
  ON post_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = post_id AND posts.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 3: Grant permissions
-- ============================================================================

GRANT ALL ON post_media TO service_role;
GRANT SELECT, INSERT, DELETE ON post_media TO authenticated;

-- ============================================================================
-- STEP 4: Create storage bucket (run this separately if it doesn't work)
-- ============================================================================

-- Note: This might need to be done in the Supabase Dashboard instead
-- Go to Storage > New Bucket > Name: "post-media" > Check "Public bucket"

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 5: Storage policies for post-media bucket
-- ============================================================================

-- Allow anyone to view images
DROP POLICY IF EXISTS "Public can view post media" ON storage.objects;
CREATE POLICY "Public can view post media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-media');

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "Users can upload post media" ON storage.objects;
CREATE POLICY "Users can upload post media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'post-media');

-- Allow users to delete their own uploads
DROP POLICY IF EXISTS "Users can delete own post media storage" ON storage.objects;
CREATE POLICY "Users can delete own post media storage"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'post-media');
