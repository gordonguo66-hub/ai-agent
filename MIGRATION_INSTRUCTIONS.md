# Database Migration for Comment Replies

To enable reply functionality, you need to add the `parent_comment_id` column to the `comments` table.

## Quick Fix:

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New query"
4. Copy and paste this SQL:

```sql
ALTER TABLE comments 
ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
```

5. Click "Run" (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned"
7. Refresh your browser page

## Alternative: Run the migration file

The migration file is located at: `supabase/add_comment_replies.sql`

You can copy its contents and run it in the Supabase SQL Editor.

## Verify it worked:

After running the migration, try replying to a comment again. The error should be gone and replies should work.
