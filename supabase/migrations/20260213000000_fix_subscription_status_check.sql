-- Fix: user_subscriptions status check constraint doesn't include 'inactive'
-- The initialize_user_credits trigger inserts status='inactive' for new users,
-- but the constraint was modified to exclude it.

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'inactive'));
