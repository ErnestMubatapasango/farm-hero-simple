DROP POLICY IF EXISTS "Super admins can delete yield history" ON public.crop_yield_history;

CREATE POLICY "Editors can delete yield history"
ON public.crop_yield_history
FOR DELETE
TO authenticated
USING (public.can_edit_farmer(farmer_id));

DROP POLICY IF EXISTS "Super admins can delete farmer crops" ON public.farmer_crops;

CREATE POLICY "Editors can delete farmer crops"
ON public.farmer_crops
FOR DELETE
TO authenticated
USING (public.can_edit_farmer(farmer_id));