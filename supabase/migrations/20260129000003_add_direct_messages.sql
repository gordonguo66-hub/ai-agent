-- Direct Messages System
-- Creates tables for user-to-user direct messaging

-- ============================================================================
-- STEP 1: Create direct_messages table
-- ============================================================================

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent sending messages to yourself
  CONSTRAINT no_self_message CHECK (sender_id != recipient_id)
);

-- ============================================================================
-- STEP 2: Create indexes for efficient lookups
-- ============================================================================

-- Index for fetching all messages in a conversation
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation 
  ON direct_messages(sender_id, recipient_id, created_at DESC);

-- Index for finding conversations for a user (inbox)
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient 
  ON direct_messages(recipient_id, created_at DESC);

-- Index for finding unread messages
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread 
  ON direct_messages(recipient_id, read, created_at DESC) 
  WHERE read = false;

-- Composite index for conversation queries
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_both 
  ON direct_messages(
    LEAST(sender_id, recipient_id), 
    GREATEST(sender_id, recipient_id), 
    created_at DESC
  );

-- ============================================================================
-- STEP 3: Enable RLS
-- ============================================================================

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 4: RLS Policies
-- ============================================================================

-- SELECT: Users can read messages they sent or received
CREATE POLICY "Users can read their own messages"
  ON direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- INSERT: Users can only send messages as themselves
CREATE POLICY "Users can send messages as themselves"
  ON direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- UPDATE: Users can mark messages as read (only their own received messages)
CREATE POLICY "Users can mark received messages as read"
  ON direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- DELETE: Users can delete messages they sent or received
CREATE POLICY "Users can delete their own messages"
  ON direct_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ============================================================================
-- STEP 5: Grant service role access
-- ============================================================================

GRANT ALL ON direct_messages TO service_role;
