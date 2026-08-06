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

  RETURN NEW;
END;
$function$;