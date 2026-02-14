-- Remove free plan from subscription_plans
-- Users on the free plan get set to inactive (no subscription)

-- First, clear any user subscriptions referencing the free plan
UPDATE user_subscriptions
SET plan_id = NULL, status = 'inactive'
WHERE plan_id = 'free';

-- Delete free/zero-price plans
DELETE FROM subscription_plans WHERE id = 'free' OR price_cents = 0;
