
-- RPC: list organization members with roles, last sign-in, and email
CREATE OR REPLACE FUNCTION public.list_org_members(_org_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  roles public.app_role[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role, _org_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role, _org_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    u.email::text,
    p.created_at,
    u.last_sign_in_at,
    COALESCE(
      (SELECT array_agg(ur.role ORDER BY ur.role)
         FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND (ur.organization_id = _org_id OR ur.role = 'developer'::public.app_role)),
      ARRAY[]::public.app_role[]
    ) AS roles
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE p.organization_id = _org_id
  ORDER BY p.created_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_org_members(uuid) TO authenticated;

-- RPC: replace a user's roles within an organization (super_admin / developer only)
CREATE OR REPLACE FUNCTION public.set_user_roles(
  _user_id uuid,
  _org_id uuid,
  _roles public.app_role[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Prevent assigning developer via this RPC
  IF 'developer'::public.app_role = ANY(_roles) AND NOT public.has_role(v_caller, 'developer'::public.app_role) THEN
    RAISE EXCEPTION 'Cannot assign developer role';
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
$$;

GRANT EXECUTE ON FUNCTION public.set_user_roles(uuid, uuid, public.app_role[]) TO authenticated;
