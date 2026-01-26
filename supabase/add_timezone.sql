-- Add timezone preference to profiles table
-- Default is NULL which means "use browser's local timezone"

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Add constraint to validate timezone format (IANA timezone identifiers like 'America/New_York')
-- We don't strictly validate against all timezones, but limit length
ALTER TABLE profiles ADD CONSTRAINT timezone_max_length CHECK (timezone IS NULL OR char_length(timezone) <= 64);

-- Update handle_new_user function to include timezone (set to NULL by default)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, timezone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NULL),
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      split_part(NEW.email, '@', 1),
      'User ' || substring(NEW.id::text, 1, 8)
    ),
    NULL  -- Default to browser timezone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
