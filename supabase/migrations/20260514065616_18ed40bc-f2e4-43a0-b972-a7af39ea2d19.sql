-- Tighten credit_scores RLS: exclude enumerators
DROP POLICY IF EXISTS "Org members can view credit scores" ON public.credit_scores;
DROP POLICY IF EXISTS "Org members can insert credit scores" ON public.credit_scores;
DROP POLICY IF EXISTS "Org members can update credit scores" ON public.credit_scores;

CREATE POLICY "Admins can view credit scores"
ON public.credit_scores FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
);

CREATE POLICY "Admins can insert credit scores"
ON public.credit_scores FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
);

CREATE POLICY "Admins can update credit scores"
ON public.credit_scores FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
  OR public.has_role(auth.uid(), 'developer'::public.app_role)
);