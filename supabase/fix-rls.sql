-- Fix RLS policies for INSERT operations
-- Run this in Supabase SQL Editor if you're getting RLS errors

-- Drop existing policies
DROP POLICY IF EXISTS "Users can CRUD own strategies" ON strategies;
DROP POLICY IF EXISTS "Users can CRUD own paper runs" ON paper_runs;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;
DROP POLICY IF EXISTS "Users can insert own arena entries" ON arena_entries;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;

-- Recreate with WITH CHECK for INSERT
CREATE POLICY "Users can CRUD own strategies"
  ON strategies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own paper runs"
  ON paper_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own arena entries"
  ON arena_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
