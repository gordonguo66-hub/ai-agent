-- Update RLS policies to allow everyone to read usernames (for display purposes)
-- This allows us to show usernames on posts and comments

-- Drop existing read policy
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;

-- Create new policy that allows everyone to read profiles (for username display)
CREATE POLICY "Everyone can read profiles"
  ON profiles FOR SELECT
  USING (true);

-- Keep existing update and insert policies
-- (They should already exist, but we'll ensure they're correct)
