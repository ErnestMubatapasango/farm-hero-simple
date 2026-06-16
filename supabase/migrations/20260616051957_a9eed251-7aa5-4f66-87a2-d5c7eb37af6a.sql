
-- Helper: can the current user view this farmer?
CREATE OR REPLACE FUNCTION public.can_view_farmer(_farmer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id = _farmer_id
      AND (
        public.has_role(auth.uid(), 'developer'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role, f.organization_id)
        OR public.has_role(auth.uid(), 'super_admin'::app_role, f.organization_id)
        OR (
          f.enrolled_by = auth.uid()
          AND public.has_role(auth.uid(), 'enumerator'::app_role, f.organization_id)
        )
      )
  )
$$;

-- farmers: replace org-wide SELECT with scoped SELECT
DROP POLICY IF EXISTS "Org members can view farmers" ON public.farmers;
CREATE POLICY "Members can view farmers in scope"
ON public.farmers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'developer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR public.has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR (
    enrolled_by = auth.uid()
    AND public.has_role(auth.uid(), 'enumerator'::app_role, organization_id)
  )
);

-- farmer_crops
DROP POLICY IF EXISTS "Org members can view farmer crops" ON public.farmer_crops;
CREATE POLICY "Members can view farmer crops in scope"
ON public.farmer_crops
FOR SELECT
TO authenticated
USING (public.can_view_farmer(farmer_id));

-- crop_yield_history
DROP POLICY IF EXISTS "Org members can view yield history" ON public.crop_yield_history;
CREATE POLICY "Members can view yield history in scope"
ON public.crop_yield_history
FOR SELECT
TO authenticated
USING (public.can_view_farmer(farmer_id));

-- farmer_documents
DROP POLICY IF EXISTS "Org members can view farmer documents" ON public.farmer_documents;
CREATE POLICY "Members can view farmer documents in scope"
ON public.farmer_documents
FOR SELECT
TO authenticated
USING (public.can_view_farmer(farmer_id));

-- farmer_activity_log
DROP POLICY IF EXISTS "Org members can view activity log" ON public.farmer_activity_log;
CREATE POLICY "Members can view activity log in scope"
ON public.farmer_activity_log
FOR SELECT
TO authenticated
USING (public.can_view_farmer(farmer_id));
