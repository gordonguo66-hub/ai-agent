-- Add parent_comment_id column to comments table for nested replies
ALTER TABLE comments 
ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);

-- Update RLS policies to allow reading replies (already covered by existing policies)
-- No additional policies needed as replies are just comments with a parent_comment_id
