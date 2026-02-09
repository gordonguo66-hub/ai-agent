-- Fix subscription plan features to reflect correct percentages and session limits
-- Pro: 25% more AI usage, Up to 3 sessions
-- Pro+: 35% more AI usage, Unlimited sessions
-- Ultra: 50% more AI usage, Unlimited sessions

-- Update Pro plan features
UPDATE subscription_plans
SET features = '["25% more AI usage", "Paper & live trading", "Up to 3 sessions", "Priority support"]'::jsonb
WHERE id = 'pro';

-- Update Pro+ plan features
UPDATE subscription_plans
SET features = '["35% more AI usage", "Paper & live trading", "Unlimited sessions", "Priority support", "Advanced analytics"]'::jsonb
WHERE id = 'pro_plus';

-- Update Ultra plan features
UPDATE subscription_plans
SET features = '["50% more AI usage", "Paper & live trading", "Unlimited sessions", "Dedicated support", "Advanced analytics", "Early access to features"]'::jsonb
WHERE id = 'ultra';
