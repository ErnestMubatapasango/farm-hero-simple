-- 1. create_organization: ignore a stale organization link on the profile
CREATE OR REPLACE FUNCTION public.create_organization(_name text, _slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_clean_slug text;
  v_existing_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name required';
  END IF;

  v_clean_slug := lower(regexp_replace(COALESCE(NULLIF(trim(_slug), ''), _name), '[^a-z0-9]+', '-', 'g'));
  v_clean_slug := regexp_replace(v_clean_slug, '(^-|-$)', '', 'g');
  IF length(v_clean_slug) = 0 THEN
    v_clean_slug := 'org-' || substr(v_uid::text, 1, 8);
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_clean_slug) THEN
    v_clean_slug := v_clean_slug || '-' || substr(v_uid::text, 1, 8);
  END IF;

  -- Only block when the profile points at an organization that STILL EXISTS.
  -- A dangling link (e.g. after the data was cleared) is treated as no org.
  SELECT p.organization_id INTO v_existing_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id
   WHERE p.user_id = v_uid;

  IF v_existing_org IS NOT NULL AND NOT public.has_role(v_uid, 'developer'::public.app_role) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (trim(_name), v_clean_slug, v_uid)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (user_id, organization_id)
  VALUES (v_uid, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_uid, v_org_id, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, organization_id, role) DO NOTHING;

  RETURN v_org_id;
END;
$function$;

-- 2. handle_invited_user: overwrite dangling org links instead of preserving them
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
    INSERT INTO public.profiles (user_id, full_name, organization_id)
    VALUES (NEW.id, v_full_name, v_inv.organization_id)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
          organization_id = EXCLUDED.organization_id;

    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, v_inv.organization_id, v_inv.role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;

    UPDATE public.invitations
       SET status = 'accepted',
           accepted_at = now(),
           invited_user_id = NEW.id
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

  RETURN NEW;
END;
$function$;

-- 3. Idempotent platform developer bootstrap (database-only, not callable from the app)
CREATE OR REPLACE FUNCTION public.ensure_platform_developer(_email text DEFAULT 'enerst@digitalbots.agency')
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'ensure_platform_developer: no auth user for %', _email;
    RETURN NULL;
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

  RETURN v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_platform_developer(text) FROM authenticated;

SELECT public.ensure_platform_developer();