-- Self-healing platform developer access
--
-- Source of truth for "who is a platform developer" lives in its own table so
-- it survives application-data resets. Signup and sign-in re-grant the
-- developer role from it, so an accidental wipe never locks everyone out.

-- 1. Allowlist table (database-only: no grants to anon/authenticated)
CREATE TABLE IF NOT EXISTS public.platform_developers (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_developers TO service_role;

ALTER TABLE public.platform_developers ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: reachable only via SECURITY DEFINER functions,
-- the table owner, and the SQL editor.

INSERT INTO public.platform_developers (email, note)
VALUES ('enerst@digitalbots.agency', 'Founding platform developer')
ON CONFLICT (email) DO NOTHING;

-- 2. Signup trigger: grant developer immediately for allowlisted emails
CREATE OR REPLACE FUNCTION public.handle_invited_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitations;
  v_full_name text;
  v_org_name text;
  v_slug text;
  v_org_id uuid;
BEGIN
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';
  v_org_name  := NULLIF(trim(NEW.raw_user_meta_data ->> 'pending_org_name'), '');

  SELECT * INTO v_inv
    FROM public.invitations
   WHERE lower(email) = lower(NEW.email)
     AND status = 'pending'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_inv.id IS NOT NULL THEN
    -- Invite email dispatch creates the auth user immediately (unconfirmed).
    -- Do NOT accept the invitation or grant a role here; acceptance happens
    -- only in public.accept_my_invitation() after the invitee sets a password.
    INSERT INTO public.profiles (user_id, full_name, organization_id)
    VALUES (NEW.id, v_full_name, v_inv.organization_id)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
          organization_id = EXCLUDED.organization_id;

    UPDATE public.invitations
       SET invited_user_id = NEW.id
     WHERE id = v_inv.id;

  ELSIF v_org_name IS NOT NULL THEN
    v_slug := regexp_replace(lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')), '(^-|-$)', '', 'g');
    IF length(coalesce(v_slug, '')) = 0 THEN
      v_slug := 'org-' || substr(NEW.id::text, 1, 8);
    END IF;
    IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || substr(NEW.id::text, 1, 8);
    END IF;

    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (v_org_name, v_slug, NEW.id)
    RETURNING id INTO v_org_id;

    INSERT INTO public.profiles (user_id, full_name, organization_id)
    VALUES (NEW.id, v_full_name, v_org_id)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
          organization_id = EXCLUDED.organization_id;

    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, v_org_id, 'super_admin'::public.app_role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;

  ELSE
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, v_full_name)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  END IF;

  -- Platform developer allowlist: independent of invitations and org metadata.
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_developers
     WHERE lower(email) = lower(NEW.email)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = NEW.id AND role = 'developer'::public.app_role
  ) THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, NULL, 'developer'::public.app_role);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Heal-on-login: caller can only ever fix their own allowlisted account
CREATE OR REPLACE FUNCTION public.heal_my_developer_role()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_developers WHERE lower(email) = v_email
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.profiles (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_uid AND role = 'developer'::public.app_role
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_uid, NULL, 'developer'::public.app_role);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.heal_my_developer_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heal_my_developer_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.heal_my_developer_role() TO authenticated;

-- 4. ensure_platform_developer now iterates the allowlist when no email given
CREATE OR REPLACE FUNCTION public.ensure_platform_developer(_email text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_last uuid;
  r record;
BEGIN
  FOR r IN
    SELECT lower(pd.email) AS email
      FROM public.platform_developers pd
     WHERE _email IS NULL OR lower(pd.email) = lower(_email)
    UNION
    SELECT lower(_email) WHERE _email IS NOT NULL
  LOOP
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = r.email LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE NOTICE 'ensure_platform_developer: no auth user for %', r.email;
      CONTINUE;
    END IF;

    INSERT INTO public.profiles (user_id)
    VALUES (v_uid)
    ON CONFLICT (user_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = v_uid AND role = 'developer'::public.app_role
    ) THEN
      INSERT INTO public.user_roles (user_id, organization_id, role)
      VALUES (v_uid, NULL, 'developer'::public.app_role);
    END IF;

    v_last := v_uid;
  END LOOP;

  RETURN v_last;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM authenticated;
