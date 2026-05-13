CREATE OR REPLACE FUNCTION public.accept_my_invitation(_full_name text DEFAULT NULL)
RETURNS public.invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_role public.app_role;
  v_meta_name text;
  v_name text;
  v_inv public.invitations;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email,
         NULLIF(raw_user_meta_data ->> 'organization_id', '')::uuid,
         NULLIF(raw_user_meta_data ->> 'role', '')::public.app_role,
         NULLIF(raw_user_meta_data ->> 'full_name', '')
    INTO v_email, v_org_id, v_role, v_meta_name
    FROM auth.users
   WHERE id = v_user_id;

  v_name := COALESCE(NULLIF(trim(_full_name), ''), v_meta_name);

  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (v_user_id, v_name, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id);

  IF v_org_id IS NOT NULL AND v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (v_user_id, v_org_id, v_role)
    ON CONFLICT (user_id, organization_id, role) DO NOTHING;
  END IF;

  UPDATE public.invitations
     SET status = 'accepted',
         accepted_at = now(),
         invited_user_id = v_user_id
   WHERE lower(email) = lower(v_email)
     AND (v_org_id IS NULL OR organization_id = v_org_id)
     AND status = 'pending'
   RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_my_invitation(text) TO authenticated;