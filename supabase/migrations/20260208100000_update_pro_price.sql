-- Update Pro plan price from $19/mo to $29/mo
UPDATE subscription_plans
SET price_cents = 2900
WHERE id = 'pro';
