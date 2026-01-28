-- User Follows Migration
-- Creates user_follows table for follower/following relationships

-- ============================================================================
-- STEP 1: Create user_follows table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Primary key on the composite to ensure uniqueness
  PRIMARY KEY (follower_id, following_id),
  
  -- Prevent self-following at database level
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- ============================================================================
-- STEP 2: Create indexes for efficient lookups
-- ============================================================================

-- Index for finding who a user follows (for Following feed)
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id 
  ON user_follows(follower_id);

-- Index for finding a user's followers (for follower count)
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id 
  ON user_follows(following_id);

-- ============================================================================
-- STEP 3: Enable RLS
-- ============================================================================

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 4: RLS Policies
-- ============================================================================

-- SELECT: Authenticated users can read all follows (needed for counts and feed)
CREATE POLICY "Authenticated users can read follows"
  ON user_follows FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Users can only follow on their own behalf
CREATE POLICY "Users can only follow as themselves"
  ON user_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- DELETE: Users can only unfollow on their own behalf
CREATE POLICY "Users can only unfollow as themselves"
  ON user_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- ============================================================================
-- STEP 5: Grant service role access
-- ============================================================================

GRANT ALL ON user_follows TO service_role;
