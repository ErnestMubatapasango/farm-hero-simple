
-- 1) Org-scoped has_role overload
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (organization_id = _org_id OR role = 'developer'::public.app_role)
  )
$$;

-- 2) farmers
DROP POLICY IF EXISTS "Admins can update farmers in their org" ON public.farmers;
CREATE POLICY "Admins can update farmers in their org" ON public.farmers
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Enumerators can create farmers in their org" ON public.farmers;
CREATE POLICY "Enumerators can create farmers in their org" ON public.farmers
FOR INSERT TO authenticated
WITH CHECK (
  (
    organization_id = get_user_org_id(auth.uid())
    AND enrolled_by = auth.uid()
    AND (
      has_role(auth.uid(), 'enumerator'::app_role, organization_id)
      OR has_role(auth.uid(), 'admin'::app_role, organization_id)
      OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
    )
  )
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Org members can view farmers" ON public.farmers;
CREATE POLICY "Org members can view farmers" ON public.farmers
FOR SELECT TO authenticated
USING (
  organization_id = get_user_org_id(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can delete farmers in their org" ON public.farmers;
CREATE POLICY "Super admins can delete farmers in their org" ON public.farmers
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 3) farmer_crops
DROP POLICY IF EXISTS "Admins can update farmer crops" ON public.farmer_crops;
CREATE POLICY "Admins can update farmer crops" ON public.farmer_crops
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Enumerators can insert farmer crops" ON public.farmer_crops;
CREATE POLICY "Enumerators can insert farmer crops" ON public.farmer_crops
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'enumerator'::app_role, organization_id)
  OR has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Org members can view farmer crops" ON public.farmer_crops;
CREATE POLICY "Org members can view farmer crops" ON public.farmer_crops
FOR SELECT TO authenticated
USING (
  organization_id = get_user_org_id(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can delete farmer crops" ON public.farmer_crops;
CREATE POLICY "Super admins can delete farmer crops" ON public.farmer_crops
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 4) crop_yield_history
DROP POLICY IF EXISTS "Admins can update yield history" ON public.crop_yield_history;
CREATE POLICY "Admins can update yield history" ON public.crop_yield_history
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Enumerators can insert yield history" ON public.crop_yield_history;
CREATE POLICY "Enumerators can insert yield history" ON public.crop_yield_history
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'enumerator'::app_role, organization_id)
  OR has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Org members can view yield history" ON public.crop_yield_history;
CREATE POLICY "Org members can view yield history" ON public.crop_yield_history
FOR SELECT TO authenticated
USING (
  organization_id = get_user_org_id(auth.uid())
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can delete yield history" ON public.crop_yield_history;
CREATE POLICY "Super admins can delete yield history" ON public.crop_yield_history
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 5) invitations: drop unused token column + scope policies
ALTER TABLE public.invitations DROP COLUMN IF EXISTS token;

DROP POLICY IF EXISTS "Super admins can create invitations" ON public.invitations;
CREATE POLICY "Super admins can create invitations" ON public.invitations
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can delete invitations" ON public.invitations;
CREATE POLICY "Super admins can delete invitations" ON public.invitations
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can update invitations" ON public.invitations;
CREATE POLICY "Super admins can update invitations" ON public.invitations
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can view org invitations" ON public.invitations;
CREATE POLICY "Super admins can view org invitations" ON public.invitations
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 6) user_roles
DROP POLICY IF EXISTS "Super admins can delete org roles" ON public.user_roles;
CREATE POLICY "Super admins can delete org roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can manage org roles" ON public.user_roles;
CREATE POLICY "Super admins can manage org roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Super admins can update org roles" ON public.user_roles;
CREATE POLICY "Super admins can update org roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

-- 7) profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);
