-- CRITICAL SECURITY FIX: Revoke direct access to financial RPC functions from authenticated users
-- These functions accept arbitrary user_id parameters and must ONLY be callable via service_role.
-- Without this fix, any logged-in user could:
--   1. Call increment_user_balance(their_id, 99999999, 'fake') to give themselves unlimited money
--   2. Call decrement_user_balance(other_user_id, amount) to drain another user's balance

-- Revoke balance manipulation functions from authenticated users
REVOKE EXECUTE ON FUNCTION increment_user_balance FROM authenticated;
REVOKE EXECUTE ON FUNCTION decrement_user_balance FROM authenticated;

-- Revoke tick lock function from public and authenticated
-- Only the cron/tick system (service_role) should be able to acquire tick locks
REVOKE EXECUTE ON FUNCTION acquire_tick_lock FROM public;
REVOKE EXECUTE ON FUNCTION acquire_tick_lock FROM authenticated;
GRANT EXECUTE ON FUNCTION acquire_tick_lock TO service_role;

-- Verify: After this migration, only service_role can call these functions
-- All callers (tick/route.ts, webhooks/stripe, credits/usage) use createServiceRoleClient()
-- so they will continue to work correctly.

NOTIFY pgrst, 'reload schema';
