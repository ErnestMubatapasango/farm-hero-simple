CREATE OR REPLACE FUNCTION public.compute_credit_score(_farmer_id uuid)
 RETURNS credit_scores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.has_permission(auth.uid(), 'credit.compute', v_farmer.organization_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(DISTINCT year), COALESCE(AVG(yield_kg),0),
         COALESCE((array_agg(yield_kg ORDER BY year ASC))[1], 0),
         COALESCE((array_agg(yield_kg ORDER BY year DESC))[1], 0)
    INTO v_years, v_avg, v_first, v_last
  FROM public.crop_yield_history
  WHERE farmer_id = _farmer_id AND yield_kg > 0;

  v_size := COALESCE(v_farmer.farm_size_hectares, 0);

  IF v_years > 0 THEN
    v_yield_history := LEAST(v_years::numeric/4,1)*50
                     + LEAST((v_avg / GREATEST(v_size,0.5)) / 2000, 1)*50;
  END IF;

  IF v_years >= 2 AND v_first > 0 THEN
    v_growth := ((v_last - v_first) / v_first) * 100;
    v_yield_growth := GREATEST(0, LEAST(100, 50 + v_growth * 1.5));
  END IF;

  IF v_size > 0 THEN
    v_farm_size := LEAST(100, 20 + log(2, GREATEST(v_size,0.5)+1) * 35);
  END IF;

  SELECT COUNT(DISTINCT farming_method) INTO v_methods
  FROM public.farmer_crops
  WHERE farmer_id = _farmer_id AND farming_method IS NOT NULL;
  v_methods_score := LEAST(100, v_methods * 25);

  v_income := COALESCE(v_farmer.annual_income, 0);
  v_financial := 0;
  IF v_farmer.has_bank_account THEN v_financial := v_financial + 30; END IF;
  IF v_income > 0 THEN v_financial := v_financial + 40; END IF;
  v_financial := LEAST(100, v_financial);

  SELECT COUNT(*) INTO v_verified_docs FROM public.farmer_documents
    WHERE farmer_id = _farmer_id AND status = 'verified';
  v_verification := 0;
  IF v_farmer.phone IS NOT NULL AND v_farmer.first_name IS NOT NULL THEN v_verification := v_verification + 25; END IF;
  IF v_farmer.region IS NOT NULL AND v_farmer.district IS NOT NULL THEN v_verification := v_verification + 15; END IF;
  v_verification := v_verification + LEAST(v_verified_docs * 15, 45);
  v_verification := LEAST(100, v_verification);

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

  v_inputs_hash := encode(sha256((v_breakdown::text || v_score::text)::bytea), 'hex');

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
$function$;