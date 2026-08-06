
-- =========================
-- 0.4 FKs
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='farmer_documents_farmer_id_fkey') THEN
    ALTER TABLE public.farmer_documents
      ADD CONSTRAINT farmer_documents_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='credit_scores_farmer_id_fkey') THEN
    ALTER TABLE public.credit_scores
      ADD CONSTRAINT credit_scores_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='farmer_activity_log_farmer_id_fkey') THEN
    ALTER TABLE public.farmer_activity_log
      ADD CONSTRAINT farmer_activity_log_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='farmer_crops_farmer_id_fkey') THEN
    ALTER TABLE public.farmer_crops
      ADD CONSTRAINT farmer_crops_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crop_yield_history_farmer_id_fkey') THEN
    ALTER TABLE public.crop_yield_history
      ADD CONSTRAINT crop_yield_history_farmer_id_fkey
      FOREIGN KEY (farmer_id) REFERENCES public.farmers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =========================
-- 0.4 dedup
-- =========================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_farmers_org_national_id
  ON public.farmers(organization_id, national_id)
  WHERE national_id IS NOT NULL;

-- =========================
-- 1.5 rejection_reason
-- =========================
ALTER TABLE public.farmers ADD COLUMN IF NOT EXISTS rejection_reason text;

-- =========================
-- 0.2 credit_scores provenance + lock writes
-- =========================
ALTER TABLE public.credit_scores ADD COLUMN IF NOT EXISTS engine_version text NOT NULL DEFAULT 'v1';

-- Revoke direct write privileges from clients; keep read for admins via RLS.
REVOKE INSERT, UPDATE, DELETE ON public.credit_scores FROM authenticated;

-- Drop any permissive write policies (if present).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy WHERE polrelid = 'public.credit_scores'::regclass
      AND polcmd IN ('a','w','d')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.credit_scores', r.polname);
  END LOOP;
END $$;

-- =========================
-- 0.2 compute_credit_score RPC (server-authoritative)
-- =========================
CREATE OR REPLACE FUNCTION public.compute_credit_score(_farmer_id uuid)
RETURNS public.credit_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_farmer public.farmers;
  v_years  int := 0;
  v_avg    numeric := 0;
  v_first  numeric := 0;
  v_last   numeric := 0;
  v_growth numeric := 0;
  v_methods int := 0;
  v_verified_docs int := 0;
  v_income numeric := 0;
  v_size   numeric := 0;
  v_yield_history numeric := 0;
  v_yield_growth  numeric := 0;
  v_farm_size     numeric := 0;
  v_methods_score numeric := 0;
  v_financial     numeric := 0;
  v_verification  numeric := 0;
  v_total_norm    numeric := 0;
  v_score         int;
  v_band          text;
  v_breakdown     jsonb;
  v_recs          jsonb := '[]'::jsonb;
  v_inputs_hash   text;
  v_row           public.credit_scores;
BEGIN
  SELECT * INTO v_farmer FROM public.farmers WHERE id = _farmer_id;
  IF v_farmer.id IS NULL THEN
    RAISE EXCEPTION 'Farmer not found';
  END IF;

  -- Authorization: caller must be able to view farmer AND hold an admin-ish role.
  IF NOT (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role, v_farmer.organization_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role, v_farmer.organization_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Aggregate yield history
  SELECT COUNT(DISTINCT year), COALESCE(AVG(yield_kg),0),
         COALESCE((array_agg(yield_kg ORDER BY year ASC))[1], 0),
         COALESCE((array_agg(yield_kg ORDER BY year DESC))[1], 0)
    INTO v_years, v_avg, v_first, v_last
  FROM public.crop_yield_history
  WHERE farmer_id = _farmer_id AND yield_kg > 0;

  v_size := COALESCE(v_farmer.farm_size_hectares, 0);

  -- 1. Yield history (0-100)
  IF v_years > 0 THEN
    v_yield_history := LEAST(v_years::numeric/4,1)*50
                     + LEAST((v_avg / GREATEST(v_size,0.5)) / 2000, 1)*50;
  END IF;

  -- 2. Growth
  IF v_years >= 2 AND v_first > 0 THEN
    v_growth := ((v_last - v_first) / v_first) * 100;
    v_yield_growth := GREATEST(0, LEAST(100, 50 + v_growth * 1.5));
  END IF;

  -- 3. Farm size
  IF v_size > 0 THEN
    v_farm_size := LEAST(100, 20 + log(2, GREATEST(v_size,0.5)+1) * 35);
  END IF;

  -- 4. Farming methods (distinct methods across crops)
  SELECT COUNT(DISTINCT farming_method) INTO v_methods
  FROM public.farmer_crops
  WHERE farmer_id = _farmer_id AND farming_method IS NOT NULL;
  v_methods_score := LEAST(100, v_methods * 25);

  -- 5. Financial
  v_income := COALESCE(v_farmer.annual_income, 0);
  v_financial := 0;
  IF v_farmer.has_bank_account THEN v_financial := v_financial + 30; END IF;
  IF v_income > 0 THEN v_financial := v_financial + 40; END IF; -- expenses/loan not captured yet
  v_financial := LEAST(100, v_financial);

  -- 6. Verification
  SELECT COUNT(*) INTO v_verified_docs FROM public.farmer_documents
    WHERE farmer_id = _farmer_id AND status = 'verified';
  v_verification := 0;
  IF v_farmer.phone IS NOT NULL AND v_farmer.first_name IS NOT NULL THEN v_verification := v_verification + 25; END IF;
  IF v_farmer.region IS NOT NULL AND v_farmer.district IS NOT NULL THEN v_verification := v_verification + 15; END IF;
  v_verification := v_verification + LEAST(v_verified_docs * 15, 45);
  v_verification := LEAST(100, v_verification);

  -- Weighted total
  v_total_norm :=
      v_yield_history * 0.25
    + v_yield_growth  * 0.15
    + v_farm_size     * 0.10
    + v_methods_score * 0.15
    + v_financial     * 0.20
    + v_verification  * 0.15;

  v_score := ROUND(300 + (v_total_norm / 100.0) * 550)::int;
  v_band := CASE
    WHEN v_score < 500 THEN 'Poor'
    WHEN v_score < 620 THEN 'Fair'
    WHEN v_score < 720 THEN 'Good'
    WHEN v_score < 800 THEN 'Very Good'
    ELSE 'Excellent' END;

  v_breakdown := jsonb_build_array(
    jsonb_build_object('key','yieldHistory','label','Yield History','score',v_yield_history,'weight',0.25,'weighted',v_yield_history*0.25,'detail', CASE WHEN v_years=0 THEN 'Not yet assessed' ELSE v_years||' yr(s), avg '||ROUND(v_avg)||'kg' END),
    jsonb_build_object('key','yieldGrowth','label','Yield Growth','score',v_yield_growth,'weight',0.15,'weighted',v_yield_growth*0.15,'detail', CASE WHEN v_years<2 THEN 'Not yet assessed' ELSE ROUND(v_growth)||'% YoY' END),
    jsonb_build_object('key','farmSize','label','Farm Size','score',v_farm_size,'weight',0.10,'weighted',v_farm_size*0.10,'detail', CASE WHEN v_size=0 THEN 'Not provided' ELSE v_size||' hectares' END),
    jsonb_build_object('key','farmingMethods','label','Farming Methods','score',v_methods_score,'weight',0.15,'weighted',v_methods_score*0.15,'detail', v_methods||' method(s)'),
    jsonb_build_object('key','financialHealth','label','Financial Health','score',v_financial,'weight',0.20,'weighted',v_financial*0.20,'detail','Bank='||v_farmer.has_bank_account::text||' Income='||v_income::text),
    jsonb_build_object('key','profileVerification','label','Verification','score',v_verification,'weight',0.15,'weighted',v_verification*0.15,'detail',v_verified_docs||' verified doc(s)')
  );

  v_inputs_hash := encode(digest(v_breakdown::text || v_score::text, 'sha256'), 'hex');

  INSERT INTO public.credit_scores AS cs
    (farmer_id, organization_id, score, band, breakdown, recommendations, inputs_hash, computed_by, computed_at, engine_version)
  VALUES
    (_farmer_id, v_farmer.organization_id, v_score, v_band, v_breakdown, v_recs, v_inputs_hash, auth.uid(), now(), 'v1-server')
  ON CONFLICT (farmer_id) DO UPDATE
    SET score = EXCLUDED.score,
        band = EXCLUDED.band,
        breakdown = EXCLUDED.breakdown,
        recommendations = EXCLUDED.recommendations,
        inputs_hash = EXCLUDED.inputs_hash,
        computed_by = EXCLUDED.computed_by,
        computed_at = EXCLUDED.computed_at,
        engine_version = EXCLUDED.engine_version,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

-- pgcrypto needed for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

REVOKE ALL ON FUNCTION public.compute_credit_score(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_credit_score(uuid) TO authenticated;

-- Ensure credit_scores has unique constraint on farmer_id for upsert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='credit_scores_farmer_id_key') THEN
    ALTER TABLE public.credit_scores ADD CONSTRAINT credit_scores_farmer_id_key UNIQUE (farmer_id);
  END IF;
END $$;

-- =========================
-- 1.3 State machine trigger
-- =========================
CREATE OR REPLACE FUNCTION public.farmers_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_has_nid boolean;
  v_has_land boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Allowed transitions
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('verified','rejected'))
      OR (OLD.status = 'rejected'  AND NEW.status IN ('draft','submitted'))
      OR (OLD.status = 'verified'  AND NEW.status IN ('submitted')
          AND public.has_role(auth.uid(),'super_admin'::public.app_role, NEW.organization_id))
    ) THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
    END IF;

    -- Required-docs gate on submit
    IF NEW.status = 'submitted' THEN
      SELECT EXISTS (SELECT 1 FROM public.farmer_documents WHERE farmer_id = NEW.id AND document_type = 'national_id') INTO v_has_nid;
      SELECT EXISTS (SELECT 1 FROM public.farmer_documents WHERE farmer_id = NEW.id AND document_type = 'land_title') INTO v_has_land;
      IF NOT (v_has_nid AND v_has_land) THEN
        RAISE EXCEPTION 'National ID and Land Title documents are required to submit for review';
      END IF;
      NEW.submitted_at := now();
    END IF;
  END IF;

  -- Immutability of core fields once verified (super_admin can still transition status via allowed path)
  IF TG_OP = 'UPDATE' AND OLD.status = 'verified' AND NEW.status = 'verified' THEN
    IF NEW.first_name IS DISTINCT FROM OLD.first_name
       OR NEW.last_name IS DISTINCT FROM OLD.last_name
       OR NEW.national_id IS DISTINCT FROM OLD.national_id
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
       OR NEW.farm_size_hectares IS DISTINCT FROM OLD.farm_size_hectares THEN
      RAISE EXCEPTION 'Verified farmer records cannot be modified. Reopen the record first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_farmers_state_machine ON public.farmers;
CREATE TRIGGER trg_farmers_state_machine
  BEFORE UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_state_machine();

-- =========================
-- 0.3 Revocation: clear org link on profile
-- =========================
CREATE OR REPLACE FUNCTION public.revoke_invitation(_invitation_id uuid)
 RETURNS public.invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $fn$
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

    -- Unset org link on the profile so the revoked user cannot see any org data.
    UPDATE public.profiles
       SET organization_id = NULL
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
$fn$;

-- =========================
-- 0.3 farmer_activity_log INSERT policy: require org role
-- =========================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.farmer_activity_log'::regclass AND polcmd = 'a'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.farmer_activity_log', r.polname);
  END LOOP;
END $$;

CREATE POLICY "activity_log_insert_org_members"
ON public.farmer_activity_log FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.get_user_org_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role, organization_id)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
    OR public.has_role(auth.uid(), 'enumerator'::public.app_role, organization_id)
  )
);

-- =========================
-- 0.3 Storage policies for farmer-documents
-- Path convention: {organization_id}/{farmer_id}/{filename}
-- =========================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
      AND polname LIKE '%farmer-documents%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

CREATE POLICY "farmer-documents-select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id::text = (storage.foldername(name))[2]
      AND f.organization_id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'developer'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role, f.organization_id)
        OR public.has_role(auth.uid(), 'super_admin'::public.app_role, f.organization_id)
        OR (
          public.has_role(auth.uid(), 'enumerator'::public.app_role, f.organization_id)
          AND f.enrolled_by = auth.uid()
        )
      )
  )
);

CREATE POLICY "farmer-documents-insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'farmer-documents'
  AND EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id::text = (storage.foldername(name))[2]
      AND f.organization_id::text = (storage.foldername(name))[1]
      AND public.can_edit_farmer(f.id)
  )
);

CREATE POLICY "farmer-documents-update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id::text = (storage.foldername(name))[2]
      AND f.organization_id::text = (storage.foldername(name))[1]
      AND public.can_edit_farmer(f.id)
  )
);

CREATE POLICY "farmer-documents-delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id::text = (storage.foldername(name))[2]
      AND f.organization_id::text = (storage.foldername(name))[1]
      AND public.can_edit_farmer(f.id)
  )
);
