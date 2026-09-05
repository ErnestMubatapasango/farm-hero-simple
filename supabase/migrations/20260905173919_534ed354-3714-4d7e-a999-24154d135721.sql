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
  v_size_effective numeric := 0;
  v_yield_cap numeric := 0;
  v_revenue numeric := 0;
  v_has_fin_doc boolean := false;
  v_yield_history numeric := 0;
  v_yield_growth  numeric := 0;
  v_farm_size     numeric := 0;
  v_methods_score numeric := 0;
  v_financial     numeric := 0;
  v_fin_detail    text;
  v_verification  numeric := 0;
  v_total_norm    numeric := 0;
  v_conf_pts      numeric := 0;
  v_conf_max      numeric := 0;
  v_confidence    numeric := 0;
  v_score         int;
  v_band          text;
  v_breakdown     jsonb;
  v_recs          jsonb := '[]'::jsonb;
  v_rec_list      text[] := ARRAY[]::text[];
  v_inputs_hash   text;
  v_row           public.credit_scores;
  v_base          numeric := 0;
  v_lo_pct        numeric := 0;
  v_hi_pct        numeric := 0;
  v_lend_min      numeric := 0;
  v_lend_max      numeric := 0;
  v_lend_detail   text;
  c_yield_per_ha_cap constant numeric := 12000;
  c_yield_benchmark  constant numeric := 2000;
  c_income_band      constant numeric := 5000;
BEGIN
  SELECT * INTO v_farmer FROM public.farmers WHERE id = _farmer_id;
  IF v_farmer.id IS NULL THEN
    RAISE EXCEPTION 'Farmer not found';
  END IF;

  IF NOT public.has_permission(auth.uid(), 'credit.compute', v_farmer.organization_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_size := COALESCE(v_farmer.farm_size_hectares, 0);
  IF v_size <= 0 THEN v_size := 0; END IF;
  v_size_effective := GREATEST(v_size, 0.5);
  v_yield_cap := c_yield_per_ha_cap * v_size_effective;

  SELECT COUNT(DISTINCT year),
         COALESCE(AVG(LEAST(yield_kg, v_yield_cap)),0),
         COALESCE((array_agg(LEAST(yield_kg, v_yield_cap) ORDER BY year ASC))[1], 0),
         COALESCE((array_agg(LEAST(yield_kg, v_yield_cap) ORDER BY year DESC))[1], 0),
         COALESCE(SUM(GREATEST(COALESCE(revenue_usd,0),0)),0)
    INTO v_years, v_avg, v_first, v_last, v_revenue
  FROM public.crop_yield_history
  WHERE farmer_id = _farmer_id
    AND yield_kg > 0
    AND year BETWEEN 1980 AND EXTRACT(YEAR FROM now())::int;

  IF v_years > 0 THEN
    v_yield_history := LEAST(v_years::numeric/4,1)*50
                     + LEAST((v_avg / v_size_effective) / c_yield_benchmark, 1)*50;
  END IF;

  IF v_years >= 2 AND v_first > 0 THEN
    v_growth := ((v_last - v_first) / v_first) * 100;
    v_yield_growth := GREATEST(0, LEAST(100, 50 + v_growth * 1.5));
  END IF;

  IF v_size > 0 THEN
    v_farm_size := LEAST(100, 20 + log(2, v_size_effective + 1) * 35);
  END IF;

  SELECT COUNT(DISTINCT m) INTO v_methods
  FROM (
    SELECT replace(replace(lower(btrim(farming_method)), '_', '-'), ' ', '-') AS m
    FROM public.farmer_crops
    WHERE farmer_id = _farmer_id AND farming_method IS NOT NULL
  ) s
  WHERE m IN ('conservation','irrigated','rain-fed','rotation','mixed','agroforestry');
  v_methods_score := LEAST(100, v_methods * 25);

  SELECT COUNT(*) INTO v_verified_docs FROM public.farmer_documents
    WHERE farmer_id = _farmer_id AND status = 'verified';

  SELECT EXISTS (
    SELECT 1 FROM public.farmer_documents
    WHERE farmer_id = _farmer_id
      AND status = 'verified'
      AND (
        lower(document_type) IN ('bank_statement','bank','financial','financial_statement','receipt')
        OR lower(document_type) LIKE '%bank%'
        OR lower(document_type) LIKE '%financ%'
        OR lower(document_type) LIKE '%statement%'
      )
  ) INTO v_has_fin_doc;

  v_income := GREATEST(COALESCE(v_farmer.annual_income, 0), 0);
  v_financial := 0;
  IF v_income > 0 THEN
    v_financial := v_financial + LEAST(v_income / c_income_band, 1) * 55;
  END IF;
  IF v_revenue > 0 THEN
    v_financial := v_financial + 15;
  END IF;
  IF v_farmer.has_bank_account AND v_has_fin_doc THEN
    v_financial := v_financial + 30;
  END IF;
  v_financial := LEAST(100, v_financial);
  IF NOT v_has_fin_doc THEN
    v_financial := LEAST(v_financial, 40);
    v_fin_detail := 'Self-reported only (capped) · income '||ROUND(v_income)::text;
  ELSE
    v_fin_detail := 'Verified financial doc · income '||ROUND(v_income)::text;
  END IF;

  v_verification := 0;
  IF v_farmer.phone IS NOT NULL AND v_farmer.first_name IS NOT NULL THEN v_verification := v_verification + 25; END IF;
  IF v_farmer.region IS NOT NULL AND v_farmer.district IS NOT NULL THEN v_verification := v_verification + 15; END IF;
  v_verification := v_verification + LEAST(v_verified_docs * 15, 45);
  v_verification := LEAST(100, v_verification);

  v_conf_max := 16;
  IF v_farmer.first_name IS NOT NULL AND v_farmer.last_name IS NOT NULL THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_farmer.phone IS NOT NULL THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_farmer.date_of_birth IS NOT NULL THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_farmer.region IS NOT NULL AND v_farmer.district IS NOT NULL THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_size > 0 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_income > 0 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_methods > 0 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_years >= 1 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_years >= 2 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_revenue > 0 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_farmer.status = 'verified' THEN v_conf_pts := v_conf_pts + 2; END IF;
  IF v_verified_docs >= 1 THEN v_conf_pts := v_conf_pts + 2; END IF;
  IF v_verified_docs >= 3 THEN v_conf_pts := v_conf_pts + 1; END IF;
  IF v_has_fin_doc THEN v_conf_pts := v_conf_pts + 2; END IF;
  v_confidence := ROUND(LEAST(100, (v_conf_pts / v_conf_max) * 100));

  v_total_norm :=
      v_yield_history * 0.25
    + v_yield_growth  * 0.15
    + v_farm_size     * 0.10
    + v_methods_score * 0.15
    + v_financial     * 0.20
    + v_verification  * 0.15;

  v_score := ROUND(300 + (v_total_norm / 100.0) * 550)::int;

  IF v_confidence < 50 THEN
    v_band := 'Insufficient data';
  ELSE
    v_band := CASE
      WHEN v_score < 500 THEN 'Poor'
      WHEN v_score < 620 THEN 'Fair'
      WHEN v_score < 720 THEN 'Good'
      WHEN v_score < 800 THEN 'Very Good'
      ELSE 'Excellent' END;
  END IF;

  v_base := GREATEST(v_income, v_revenue / GREATEST(v_years, 1));
  SELECT lo, hi INTO v_lo_pct, v_hi_pct FROM (
    VALUES
      ('Excellent', 0.50::numeric, 0.80::numeric),
      ('Very Good', 0.35, 0.55),
      ('Good',      0.20, 0.35),
      ('Fair',      0.10, 0.20),
      ('Poor',      0.00, 0.05)
  ) AS t(b, lo, hi) WHERE b = v_band;
  v_lo_pct := COALESCE(v_lo_pct, 0);
  v_hi_pct := COALESCE(v_hi_pct, 0);
  v_lend_min := ROUND(v_base * v_lo_pct);
  v_lend_max := ROUND(v_base * v_hi_pct);

  IF v_band = 'Insufficient data' THEN
    v_lend_detail := 'No lending range — data confidence is below 50%. Complete the record first.';
  ELSIF v_base <= 0 THEN
    v_lend_detail := 'No lending range — capture annual income or crop revenue to size a facility.';
  ELSIF v_lend_max <= 0 THEN
    v_lend_detail := 'Lending not recommended at this score. Build a repayment record with in-kind input support first.';
  ELSE
    v_lend_detail := 'Indicative facility USD '||v_lend_min::text||' – '||v_lend_max::text
      ||' ('||ROUND(v_lo_pct*100)::text||'–'||ROUND(v_hi_pct*100)::text||'% of USD '||ROUND(v_base)::text||' turnover)';
  END IF;

  IF NOT v_has_fin_doc THEN
    v_rec_list := v_rec_list || 'Verify a bank or financial statement to unlock full financial scoring';
  END IF;
  IF v_years < 2 THEN
    v_rec_list := v_rec_list || ('Add at least '||GREATEST(2 - v_years, 1)::text||' more season(s) of yield history to assess growth');
  ELSIF v_yield_history < 80 THEN
    v_rec_list := v_rec_list || 'Record more seasons of yield history (4+ years strengthens the score)';
  END IF;
  IF v_verified_docs = 0 THEN
    v_rec_list := v_rec_list || 'Upload identification and land documents for verification';
  END IF;
  IF v_methods = 0 THEN
    v_rec_list := v_rec_list || 'Record a recognised farming method for each crop';
  END IF;
  IF v_size <= 0 THEN
    v_rec_list := v_rec_list || 'Capture an accurate farm size in hectares';
  END IF;
  IF v_income <= 0 THEN
    v_rec_list := v_rec_list || 'Capture the farmer''s annual income';
  END IF;
  IF v_farmer.phone IS NULL THEN
    v_rec_list := v_rec_list || 'Add a contact phone number';
  END IF;
  IF v_farmer.status <> 'verified' THEN
    v_rec_list := v_rec_list || 'Complete verification of this farmer record';
  END IF;
  IF array_length(v_rec_list, 1) IS NULL THEN
    v_rec_list := ARRAY[
      'Record the next season''s yields to keep the score current',
      'Refresh verified financial evidence annually'
    ];
  ELSIF array_length(v_rec_list, 1) = 1 THEN
    v_rec_list := v_rec_list || 'Keep yield and revenue records up to date each season';
  END IF;
  v_rec_list := v_rec_list[1:4];

  IF v_confidence < 50 THEN
    v_rec_list := v_rec_list || 'Data confidence is below 50% — treat the score as indicative only';
  ELSE
    v_rec_list := v_rec_list || CASE
      WHEN v_score >= 720 THEN 'Creditworthiness: strong candidate for input or working-capital finance'
      WHEN v_score >= 620 THEN 'Creditworthiness: moderate — consider a smaller facility with monitoring'
      ELSE 'Creditworthiness: weak — build record before extending credit' END;
  END IF;
  v_recs := to_jsonb(v_rec_list);

  v_breakdown := jsonb_build_array(
    jsonb_build_object('key','yieldHistory','label','Yield History','score',v_yield_history,'weight',0.25,'weighted',v_yield_history*0.25,'detail', CASE WHEN v_years=0 THEN 'Not yet assessed' ELSE v_years||' yr(s), avg '||ROUND(v_avg)||'kg' END),
    jsonb_build_object('key','yieldGrowth','label','Yield Growth','score',v_yield_growth,'weight',0.15,'weighted',v_yield_growth*0.15,'detail', CASE WHEN v_years<2 THEN 'Not yet assessed' ELSE ROUND(v_growth)||'% YoY' END),
    jsonb_build_object('key','farmSize','label','Farm Size','score',v_farm_size,'weight',0.10,'weighted',v_farm_size*0.10,'detail', CASE WHEN v_size=0 THEN 'Not provided' ELSE v_size||' hectares' END),
    jsonb_build_object('key','farmingMethods','label','Farming Methods','score',v_methods_score,'weight',0.15,'weighted',v_methods_score*0.15,'detail', v_methods||' recognised method(s)'),
    jsonb_build_object('key','financialHealth','label','Financial Health','score',v_financial,'weight',0.20,'weighted',v_financial*0.20,'detail', v_fin_detail),
    jsonb_build_object('key','profileVerification','label','Verification','score',v_verification,'weight',0.15,'weighted',v_verification*0.15,'detail',v_verified_docs||' verified doc(s)'),
    jsonb_build_object('key','confidence','label','Data Confidence','score',v_confidence,'weight',0,'weighted',0,'detail', v_confidence||'% of key fields present'||CASE WHEN v_confidence < 50 THEN ' — insufficient' ELSE '' END),
    jsonb_build_object('key','lending','label','Lending Guidance','score',0,'weight',0,'weighted',0,'detail', v_lend_detail,
                       'min', v_lend_min, 'max', v_lend_max, 'basis', ROUND(v_base))
  );

  v_inputs_hash := encode(sha256((v_breakdown::text || v_score::text)::bytea), 'hex');

  INSERT INTO public.credit_scores AS cs
    (farmer_id, organization_id, score, band, breakdown, recommendations, inputs_hash, computed_by, computed_at, engine_version)
  VALUES
    (_farmer_id, v_farmer.organization_id, v_score, v_band, v_breakdown, v_recs, v_inputs_hash, auth.uid(), now(), 'v3-server')
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