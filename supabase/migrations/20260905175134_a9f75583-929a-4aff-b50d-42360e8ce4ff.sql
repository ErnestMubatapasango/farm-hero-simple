-- Harden function execution: internal SECURITY DEFINER RPCs must not be callable anonymously.
DO $$
DECLARE
  r record;
  keep_anon text[] := ARRAY['accept_my_invitation'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    IF r.proname = ANY(keep_anon) THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    -- preserve signed-in access
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Functions that were already restricted from signed-in users stay restricted.
REVOKE EXECUTE ON FUNCTION public.ensure_platform_developer(text) FROM authenticated;