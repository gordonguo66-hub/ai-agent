-- Function to notify PostgREST of schema changes
CREATE OR REPLACE FUNCTION notify_schema_change()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Trigger on DDL commands (CREATE, ALTER, DROP)
DROP EVENT TRIGGER IF EXISTS schema_change_trigger;
CREATE EVENT TRIGGER schema_change_trigger
ON ddl_command_end
EXECUTE FUNCTION notify_schema_change();
