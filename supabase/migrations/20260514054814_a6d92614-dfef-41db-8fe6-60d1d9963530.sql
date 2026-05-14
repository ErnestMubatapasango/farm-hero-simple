
-- 1. Add audit columns to farmers
ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- 2. Change default status to 'draft' and backfill 'pending' -> 'submitted'
ALTER TABLE public.farmers ALTER COLUMN status SET DEFAULT 'draft';
UPDATE public.farmers SET status = 'submitted' WHERE status = 'pending';

-- 3. Add status check constraint (4-state workflow)
ALTER TABLE public.farmers DROP CONSTRAINT IF EXISTS farmers_status_check;
ALTER TABLE public.farmers
  ADD CONSTRAINT farmers_status_check
  CHECK (status IN ('draft', 'submitted', 'verified', 'rejected'));

-- 4. Activity log table
CREATE TABLE IF NOT EXISTS public.farmer_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  changes jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farmer_activity_log_farmer ON public.farmer_activity_log(farmer_id, created_at DESC);

ALTER TABLE public.farmer_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view activity log" ON public.farmer_activity_log;
CREATE POLICY "Org members can view activity log"
  ON public.farmer_activity_log FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'developer'::app_role));

DROP POLICY IF EXISTS "Org members can insert activity log" ON public.farmer_activity_log;
CREATE POLICY "Org members can insert activity log"
  ON public.farmer_activity_log FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'developer'::app_role));

-- 5. Helper: can_edit_farmer
CREATE OR REPLACE FUNCTION public.can_edit_farmer(_farmer_id uuid)
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
          AND f.status IN ('draft', 'rejected')
          AND public.has_role(auth.uid(), 'enumerator'::app_role, f.organization_id)
        )
      )
  )
$$;

-- 6. Trigger: maintain updated_by/updated_at and write activity log
CREATE OR REPLACE FUNCTION public.farmers_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.farmer_activity_log (farmer_id, organization_id, actor_id, action, to_status)
    VALUES (NEW.id, NEW.organization_id, v_actor, 'created', NEW.status);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.farmer_activity_log (farmer_id, organization_id, actor_id, action, from_status, to_status, notes)
      VALUES (NEW.id, NEW.organization_id, v_actor,
              CASE NEW.status
                WHEN 'submitted' THEN 'submitted'
                WHEN 'verified' THEN 'verified'
                WHEN 'rejected' THEN 'rejected'
                ELSE 'status_changed'
              END,
              OLD.status, NEW.status,
              CASE WHEN NEW.status = 'rejected' THEN NEW.notes ELSE NULL END);
    ELSE
      INSERT INTO public.farmer_activity_log (farmer_id, organization_id, actor_id, action)
      VALUES (NEW.id, NEW.organization_id, v_actor, 'updated');
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.farmers_set_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmers_set_updated_by ON public.farmers;
CREATE TRIGGER trg_farmers_set_updated_by
  BEFORE UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_set_updated_by();

DROP TRIGGER IF EXISTS trg_farmers_audit ON public.farmers;
CREATE TRIGGER trg_farmers_audit
  AFTER INSERT OR UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_audit_trigger();

-- 7. Replace farmers UPDATE policy with role-aware version
DROP POLICY IF EXISTS "Admins can update farmers in their org" ON public.farmers;

CREATE POLICY "Admins can update farmers in their org"
  ON public.farmers FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role, organization_id)
    OR public.has_role(auth.uid(), 'super_admin'::app_role, organization_id)
    OR public.has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Enumerators can update own editable farmers"
  ON public.farmers FOR UPDATE TO authenticated
  USING (
    enrolled_by = auth.uid()
    AND status IN ('draft', 'rejected')
    AND public.has_role(auth.uid(), 'enumerator'::app_role, organization_id)
  )
  WITH CHECK (
    enrolled_by = auth.uid()
    AND status IN ('draft', 'rejected', 'submitted')
    AND public.has_role(auth.uid(), 'enumerator'::app_role, organization_id)
  );

-- 8. Update farmer_crops + crop_yield_history policies to honor edit-window
DROP POLICY IF EXISTS "Enumerators can insert farmer crops" ON public.farmer_crops;
CREATE POLICY "Enumerators can insert farmer crops"
  ON public.farmer_crops FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_farmer(farmer_id)
    AND organization_id = public.get_user_org_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update farmer crops" ON public.farmer_crops;
CREATE POLICY "Admins/owners can update farmer crops"
  ON public.farmer_crops FOR UPDATE TO authenticated
  USING (public.can_edit_farmer(farmer_id));

DROP POLICY IF EXISTS "Enumerators can insert yield history" ON public.crop_yield_history;
CREATE POLICY "Enumerators can insert yield history"
  ON public.crop_yield_history FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit_farmer(farmer_id)
    AND organization_id = public.get_user_org_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update yield history" ON public.crop_yield_history;
CREATE POLICY "Admins/owners can update yield history"
  ON public.crop_yield_history FOR UPDATE TO authenticated
  USING (public.can_edit_farmer(farmer_id));
