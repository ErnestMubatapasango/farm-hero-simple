CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role public.app_role;
  v_full_name text;
BEGIN
  v_org_id := NULLIF(NEW.raw_user_meta_data ->> 'organization_id', '')::uuid;
  v_role := NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.app_role;
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';

  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (NEW.id, v_full_name, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id);

  IF v_org_id IS NOT NULL AND v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, v_org_id, v_role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;

    UPDATE public.invitations
       SET status = 'accepted',
           accepted_at = now(),
           invited_user_id = NEW.id
     WHERE lower(email) = lower(NEW.email)
       AND organization_id = v_org_id
       AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;