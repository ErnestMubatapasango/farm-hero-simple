ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid;

CREATE OR REPLACE FUNCTION public.revoke_invitation(_invitation_id uuid)
RETURNS public.invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inv public.invitations;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE id = _invitation_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF NOT (
    public.has_role(v_caller, 'super_admin'::public.app_role, v_inv.organization_id)
    OR public.has_role(v_caller, 'developer'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_inv.status = 'accepted' AND v_inv.invited_user_id IS NOT NULL THEN
    DELETE FROM public.user_roles
     WHERE user_id = v_inv.invited_user_id
       AND organization_id = v_inv.organization_id;
  END IF;

  UPDATE public.invitations
     SET status = 'revoked',
         revoked_at = now(),
         revoked_by = v_caller
   WHERE id = _invitation_id
   RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;