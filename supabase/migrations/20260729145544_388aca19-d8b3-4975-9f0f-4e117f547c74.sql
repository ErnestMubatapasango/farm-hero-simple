-- 1. Table
CREATE TABLE public.farm_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL UNIQUE REFERENCES public.farmers(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  score integer NOT NULL,
  band text NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_by uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  engine_version text NOT NULL DEFAULT 'fhi-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Grants
GRANT SELECT ON public.farm_health_scores TO authenticated;
GRANT ALL ON public.farm_health_scores TO service_role;

-- 3. RLS
ALTER TABLE public.farm_health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view farm health in scope"
ON public.farm_health_scores FOR SELECT
TO authenticated
USING (public.can_view_farmer(farmer_id));

-- 4. updated_at trigger
CREATE TRIGGER trg_farm_health_updated
BEFORE UPDATE ON public.farm_health_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Compute RPC
CREATE OR REPLACE FUNCTION public.compute_farm_health(_farmer_id uuid)
RETURNS public.farm_health_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farmer public.farmers;
  v_size numeric := 0;
  v_avg_yield numeric := 0;
  v_stddev numeric := 0;
  v_cv numeric := 0;
  v_avg_rev numeric := 0;
  v_org_p50_yield_per_ha numeric := 0;
  v_org_p50_rev_per_ha numeric := 0;
  v_yield_per_ha numeric := 0;
  v_rev_per_ha numeric := 0;
  v_productivity numeric := 0;
  v_consistency numeric := 0;
  v_revenue numeric := 0;
  v_scale numeric := 0;
  v_compliance numeric := 0;
  v_required_total int := 2; -- national_id + land_title
  v_required_verified int := 0;
  v_total numeric := 0;
  v_score int;
  v_band text;
  v_breakdown jsonb;
  v_row public.farm_health_scores;
BEGIN
  SELECT * INTO v_farmer FROM public.farmers WHERE id = _farmer_id;
  IF v_farmer.id IS NULL THEN
    RAISE EXCEPTION 'Farmer not found';
  END IF;

  IF NOT public.can_view_farmer(_farmer_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_size := COALESCE(v_farmer.farm_size_hectares, 0);

  -- Aggregate this farmer's yield history
  SELECT COALESCE(AVG(yield_kg), 0),
         COALESCE(stddev_samp(yield_kg), 0),
         COALESCE(AVG(revenue_usd), 0)
    INTO v_avg_yield, v_stddev, v_avg_rev
  FROM public.crop_yield_history
  WHERE farmer_id = _farmer_id AND yield_kg IS NOT NULL;

  IF v_avg_yield > 0 THEN
    v_cv := v_stddev / v_avg_yield;
  END IF;

  IF v_size > 0 THEN
    v_yield_per_ha := v_avg_yield / v_size;
    v_rev_per_ha := v_avg_rev / v_size;
  END IF;

  -- Org medians for normalization
  SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY (cyh.yield_kg / NULLIF(f.farm_size_hectares, 0))
         ), 0)
    INTO v_org_p50_yield_per_ha
  FROM public.crop_yield_history cyh
  JOIN public.farmers f ON f.id = cyh.farmer_id
  WHERE f.organization_id = v_farmer.organization_id
    AND cyh.yield_kg IS NOT NULL
    AND f.farm_size_hectares > 0;

  SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (
           ORDER BY (cyh.revenue_usd / NULLIF(f.farm_size_hectares, 0))
         ), 0)
    INTO v_org_p50_rev_per_ha
  FROM public.crop_yield_history cyh
  JOIN public.farmers f ON f.id = cyh.farmer_id
  WHERE f.organization_id = v_farmer.organization_id
    AND cyh.revenue_usd IS NOT NULL
    AND f.farm_size_hectares > 0;

  -- 1. Productivity (yield/ha vs org p50)
  IF v_org_p50_yield_per_ha > 0 AND v_yield_per_ha > 0 THEN
    v_productivity := LEAST(100, (v_yield_per_ha / v_org_p50_yield_per_ha) * 50);
  ELSIF v_yield_per_ha > 0 THEN
    v_productivity := 50; -- baseline when no org comparison exists
  END IF;

  -- 2. Consistency (lower CV = better)
  IF v_avg_yield > 0 THEN
    v_consistency := GREATEST(0, 100 - LEAST(100, v_cv * 100));
  END IF;

  -- 3. Revenue (revenue/ha vs org p50)
  IF v_org_p50_rev_per_ha > 0 AND v_rev_per_ha > 0 THEN
    v_revenue := LEAST(100, (v_rev_per_ha / v_org_p50_rev_per_ha) * 50);
  ELSIF v_rev_per_ha > 0 THEN
    v_revenue := 50;
  END IF;

  -- 4. Scale (log-scaled, 10 ha = 100)
  IF v_size > 0 THEN
    v_scale := LEAST(100, (ln(v_size + 1) / ln(11)) * 100);
  END IF;

  -- 5. Compliance (required docs verified)
  SELECT COUNT(*) INTO v_required_verified
  FROM public.farmer_documents
  WHERE farmer_id = _farmer_id
    AND status = 'verified'
    AND document_type IN ('national_id', 'land_title', 'id');
  v_compliance := LEAST(100, (v_required_verified::numeric / v_required_total) * 100);

  v_total :=
      v_productivity * 0.30
    + v_consistency  * 0.25
    + v_revenue      * 0.20
    + v_scale        * 0.15
    + v_compliance   * 0.10;

  v_score := ROUND(v_total)::int;
  v_band := CASE
    WHEN v_score < 40 THEN 'At risk'
    WHEN v_score < 60 THEN 'Developing'
    WHEN v_score < 80 THEN 'Healthy'
    ELSE 'Thriving' END;

  v_breakdown := jsonb_build_array(
    jsonb_build_object('key','productivity','label','Productivity','score',v_productivity,'weight',0.30,'detail', CASE WHEN v_yield_per_ha=0 THEN 'No yield data' ELSE ROUND(v_yield_per_ha)||' kg/ha vs org median '||ROUND(v_org_p50_yield_per_ha)||' kg/ha' END),
    jsonb_build_object('key','consistency','label','Consistency','score',v_consistency,'weight',0.25,'detail', CASE WHEN v_avg_yield=0 THEN 'No yield data' ELSE 'CV '||ROUND(v_cv*100)||'%' END),
    jsonb_build_object('key','revenue','label','Revenue per hectare','score',v_revenue,'weight',0.20,'detail', CASE WHEN v_rev_per_ha=0 THEN 'No revenue data' ELSE '$'||ROUND(v_rev_per_ha)||'/ha vs org median $'||ROUND(v_org_p50_rev_per_ha)||'/ha' END),
    jsonb_build_object('key','scale','label','Farm scale','score',v_scale,'weight',0.15,'detail', CASE WHEN v_size=0 THEN 'Not provided' ELSE v_size||' hectares' END),
    jsonb_build_object('key','compliance','label','Document compliance','score',v_compliance,'weight',0.10,'detail', v_required_verified||' of '||v_required_total||' required docs verified')
  );

  INSERT INTO public.farm_health_scores AS fhs
    (farmer_id, organization_id, score, band, breakdown, computed_by, computed_at, engine_version)
  VALUES
    (_farmer_id, v_farmer.organization_id, v_score, v_band, v_breakdown, auth.uid(), now(), 'fhi-v1')
  ON CONFLICT (farmer_id) DO UPDATE
    SET score = EXCLUDED.score,
        band = EXCLUDED.band,
        breakdown = EXCLUDED.breakdown,
        computed_by = EXCLUDED.computed_by,
        computed_at = EXCLUDED.computed_at,
        engine_version = EXCLUDED.engine_version,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;