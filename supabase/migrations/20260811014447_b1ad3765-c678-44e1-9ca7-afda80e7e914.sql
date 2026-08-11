CREATE OR REPLACE FUNCTION public.set_user_roles(_user_id uuid, _org_id uuid, _roles app_role[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_caller, 'developer'::public.app_role)
    OR public.has_role(v_caller, 'super_admin'::public.app_role, _org_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Only a developer may assign the platform-level developer role
  IF 'developer'::public.app_role = ANY(_roles) AND NOT public.has_role(v_caller, 'developer'::public.app_role) THEN
    RAISE EXCEPTION 'Cannot assign developer role';
  END IF;

  -- A super_admin may not create additional super_admins; only a developer can
  IF 'super_admin'::public.app_role = ANY(_roles)
     AND NOT public.has_role(v_caller, 'developer'::public.app_role)
     AND NOT public.has_role(_user_id, 'super_admin'::public.app_role, _org_id) THEN
    RAISE EXCEPTION 'Only a platform developer can grant the super_admin role';
  END IF;

  -- Prevent a super_admin from removing their own super_admin role (avoid lockout)
  IF v_caller = _user_id
     AND public.has_role(v_caller, 'super_admin'::public.app_role, _org_id)
     AND NOT ('super_admin'::public.app_role = ANY(_roles)) THEN
    RAISE EXCEPTION 'You cannot remove your own super_admin role';
  END IF;

  -- Wipe existing org roles for this user
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND organization_id = _org_id;

  -- Insert new role set
  IF _roles IS NOT NULL THEN
    FOREACH v_role IN ARRAY _roles LOOP
      IF v_role <> 'developer'::public.app_role THEN
        INSERT INTO public.user_roles (user_id, organization_id, role)
        VALUES (_user_id, _org_id, v_role)
        ON CONFLICT (user_id, organization_id, role) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$function$;