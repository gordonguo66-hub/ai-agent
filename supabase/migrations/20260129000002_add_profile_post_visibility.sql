-- Add visibility column to profile_posts
-- 'public' = shown in community feed + profile
-- 'profile_only' = only shown on user's profile page

ALTER TABLE profile_posts 
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'profile_only' CHECK (visibility IN ('public', 'profile_only'));

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profile_posts_visibility ON profile_posts(visibility, created_at DESC);

-- Update existing posts to be profile_only by default
UPDATE profile_posts SET visibility = 'profile_only' WHERE visibility IS NULL;
