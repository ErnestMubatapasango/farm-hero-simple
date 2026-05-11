-- farmer_crops: which crops a farmer grows + per-crop farming method
CREATE TABLE public.farmer_crops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  crop text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  farming_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farmer_id, position),
  UNIQUE (farmer_id, crop)
);

CREATE INDEX idx_farmer_crops_farmer ON public.farmer_crops(farmer_id);
CREATE INDEX idx_farmer_crops_org ON public.farmer_crops(organization_id);

ALTER TABLE public.farmer_crops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view farmer crops"
ON public.farmer_crops FOR SELECT TO authenticated
USING ((organization_id = get_user_org_id(auth.uid())) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Enumerators can insert farmer crops"
ON public.farmer_crops FOR INSERT TO authenticated
WITH CHECK (
  (organization_id = get_user_org_id(auth.uid())
   AND (has_role(auth.uid(), 'enumerator'::app_role)
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Admins can update farmer crops"
ON public.farmer_crops FOR UPDATE TO authenticated
USING (
  (organization_id = get_user_org_id(auth.uid())
   AND (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Super admins can delete farmer crops"
ON public.farmer_crops FOR DELETE TO authenticated
USING (
  (organization_id = get_user_org_id(auth.uid())
   AND has_role(auth.uid(), 'super_admin'::app_role))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE TRIGGER update_farmer_crops_updated_at
BEFORE UPDATE ON public.farmer_crops
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- crop_yield_history: per-crop, per-year yield + revenue
CREATE TABLE public.crop_yield_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  crop text NOT NULL,
  year smallint NOT NULL,
  yield_kg numeric,
  revenue_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farmer_id, crop, year)
);

CREATE INDEX idx_crop_yield_farmer ON public.crop_yield_history(farmer_id);
CREATE INDEX idx_crop_yield_org ON public.crop_yield_history(organization_id);

ALTER TABLE public.crop_yield_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view yield history"
ON public.crop_yield_history FOR SELECT TO authenticated
USING ((organization_id = get_user_org_id(auth.uid())) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Enumerators can insert yield history"
ON public.crop_yield_history FOR INSERT TO authenticated
WITH CHECK (
  (organization_id = get_user_org_id(auth.uid())
   AND (has_role(auth.uid(), 'enumerator'::app_role)
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Admins can update yield history"
ON public.crop_yield_history FOR UPDATE TO authenticated
USING (
  (organization_id = get_user_org_id(auth.uid())
   AND (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE POLICY "Super admins can delete yield history"
ON public.crop_yield_history FOR DELETE TO authenticated
USING (
  (organization_id = get_user_org_id(auth.uid())
   AND has_role(auth.uid(), 'super_admin'::app_role))
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE TRIGGER update_crop_yield_history_updated_at
BEFORE UPDATE ON public.crop_yield_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();