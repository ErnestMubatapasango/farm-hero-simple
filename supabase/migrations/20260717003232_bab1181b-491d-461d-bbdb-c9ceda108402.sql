
-- Fix: meta_role_escalation
-- Trust only the invitations table (matched by email) for org_id + role.

CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invitations;
  v_full_name text;
BEGIN
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';

  -- Look up a real pending invitation for this email. Metadata is IGNORED.
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
          organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id);

    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, v_inv.organization_id, v_inv.role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;

    UPDATE public.invitations
       SET status = 'accepted',
           accepted_at = now(),
           invited_user_id = NEW.id
     WHERE id = v_inv.id;
  ELSE
    -- No invitation: create a bare profile only. No role, no org.
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, v_full_name)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  END IF;

  RETURN NEW;
END;
$function$;

-- Drop old single-arg overload (unused, kept metadata-trusting logic)
DROP FUNCTION IF EXISTS public.accept_my_invitation();

CREATE OR REPLACE FUNCTION public.accept_my_invitation(_full_name text DEFAULT NULL::text)
RETURNS public.invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_meta_name text;
  v_name text;
  v_inv public.invitations;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email,
         NULLIF(raw_user_meta_data ->> 'full_name', '')
    INTO v_email, v_meta_name
    FROM auth.users
   WHERE id = v_user_id;

  v_name := COALESCE(NULLIF(trim(_full_name), ''), v_meta_name);

  -- Trust only the invitations table for org + role.
  SELECT * INTO v_inv
    FROM public.invitations
   WHERE lower(email) = lower(v_email)
     AND status = 'pending'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    -- No pending invite: just ensure profile name is set. No role granted.
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (v_user_id, v_name)
    ON CONFLICT (user_id) DO UPDATE
      SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
    RETURN NULL;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (v_user_id, v_name, v_inv.organization_id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id);

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_user_id, v_inv.organization_id, v_inv.role)
  ON CONFLICT (user_id, organization_id, role) DO NOTHING;

  UPDATE public.invitations
     SET status = 'accepted',
         accepted_at = now(),
         invited_user_id = v_user_id
   WHERE id = v_inv.id
   RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$function$;
