-- ============================================================
-- 1. CHECK constraints (immutable rules)
-- ============================================================
ALTER TABLE public.farmers
  ADD CONSTRAINT farmers_farm_size_hectares_range
  CHECK (farm_size_hectares IS NULL OR (farm_size_hectares > 0 AND farm_size_hectares <= 100000))
  NOT VALID;

ALTER TABLE public.farmers
  ADD CONSTRAINT farmers_annual_income_range
  CHECK (annual_income IS NULL OR (annual_income >= 0 AND annual_income <= 1000000000))
  NOT VALID;

ALTER TABLE public.crop_yield_history
  ADD CONSTRAINT crop_yield_history_year_range
  CHECK (year >= 1980 AND year <= 2200)
  NOT VALID;

ALTER TABLE public.crop_yield_history
  ADD CONSTRAINT crop_yield_history_yield_kg_nonneg
  CHECK (yield_kg IS NULL OR yield_kg >= 0)
  NOT VALID;

ALTER TABLE public.crop_yield_history
  ADD CONSTRAINT crop_yield_history_revenue_nonneg
  CHECK (revenue_usd IS NULL OR revenue_usd >= 0)
  NOT VALID;

ALTER TABLE public.farmers VALIDATE CONSTRAINT farmers_farm_size_hectares_range;
ALTER TABLE public.farmers VALIDATE CONSTRAINT farmers_annual_income_range;
ALTER TABLE public.crop_yield_history VALIDATE CONSTRAINT crop_yield_history_year_range;
ALTER TABLE public.crop_yield_history VALIDATE CONSTRAINT crop_yield_history_yield_kg_nonneg;
ALTER TABLE public.crop_yield_history VALIDATE CONSTRAINT crop_yield_history_revenue_nonneg;

-- ============================================================
-- 2. Time-relative rules via validation triggers
--    (CHECK constraints must be immutable, so now()/current_date
--     rules cannot live in a CHECK)
-- ============================================================
CREATE OR REPLACE FUNCTION public.farmers_validate_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    IF NEW.date_of_birth >= current_date THEN
      RAISE EXCEPTION 'date_of_birth must be a date in the past';
    END IF;
    IF NEW.date_of_birth > (current_date - INTERVAL '18 years') THEN
      RAISE EXCEPTION 'date_of_birth implies an age under 18; farmers must be at least 18 years old';
    END IF;
    IF NEW.date_of_birth < (current_date - INTERVAL '120 years') THEN
      RAISE EXCEPTION 'date_of_birth implies an age over 120; please check the date';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmers_validate_bounds ON public.farmers;
CREATE TRIGGER trg_farmers_validate_bounds
  BEFORE INSERT OR UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_validate_bounds();

CREATE OR REPLACE FUNCTION public.crop_yield_history_validate_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.year < 1980 OR NEW.year > EXTRACT(YEAR FROM current_date)::int THEN
    RAISE EXCEPTION 'year must be between 1980 and %', EXTRACT(YEAR FROM current_date)::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crop_yield_history_validate_bounds ON public.crop_yield_history;
CREATE TRIGGER trg_crop_yield_history_validate_bounds
  BEFORE INSERT OR UPDATE ON public.crop_yield_history
  FOR EACH ROW EXECUTE FUNCTION public.crop_yield_history_validate_bounds();

-- ============================================================
-- 3. save_farmer: re-check the same bounds with clear messages
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_farmer(_farmer_id uuid, _payload jsonb, _crops jsonb, _yields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_farmer_id uuid := _farmer_id;
  v_is_create boolean := (_farmer_id IS NULL);
  v_crop jsonb;
  v_yield jsonb;
  v_size numeric;
  v_income numeric;
  v_dob date;
  v_year int;
  v_yield_kg numeric;
  v_revenue numeric;
  v_this_year int := EXTRACT(YEAR FROM current_date)::int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ---------- validation ----------
  v_size := NULLIF(_payload->>'farm_size_hectares','')::numeric;
  IF v_size IS NOT NULL THEN
    IF v_size <= 0 THEN
      RAISE EXCEPTION 'farm_size_hectares must be greater than 0';
    END IF;
    IF v_size > 100000 THEN
      RAISE EXCEPTION 'farm_size_hectares must be 100000 or less';
    END IF;
  END IF;

  v_income := NULLIF(_payload->>'annual_income','')::numeric;
  IF v_income IS NOT NULL THEN
    IF v_income < 0 THEN
      RAISE EXCEPTION 'annual_income cannot be negative';
    END IF;
    IF v_income > 1000000000 THEN
      RAISE EXCEPTION 'annual_income must be 1000000000 or less';
    END IF;
  END IF;

  v_dob := NULLIF(_payload->>'date_of_birth','')::date;
  IF v_dob IS NOT NULL THEN
    IF v_dob >= current_date THEN
      RAISE EXCEPTION 'date_of_birth must be a date in the past';
    END IF;
    IF v_dob > (current_date - INTERVAL '18 years') THEN
      RAISE EXCEPTION 'date_of_birth implies an age under 18; farmers must be at least 18 years old';
    END IF;
    IF v_dob < (current_date - INTERVAL '120 years') THEN
      RAISE EXCEPTION 'date_of_birth implies an age over 120; please check the date';
    END IF;
  END IF;

  IF _yields IS NOT NULL AND jsonb_typeof(_yields) = 'array' THEN
    FOR v_yield IN SELECT * FROM jsonb_array_elements(_yields) LOOP
      v_year := NULLIF(v_yield->>'year','')::int;
      IF v_year IS NULL THEN
        RAISE EXCEPTION 'year is required for every yield record';
      END IF;
      IF v_year < 1980 OR v_year > v_this_year THEN
        RAISE EXCEPTION 'year must be between 1980 and %', v_this_year;
      END IF;

      v_yield_kg := NULLIF(v_yield->>'yield_kg','')::numeric;
      IF v_yield_kg IS NOT NULL AND v_yield_kg < 0 THEN
        RAISE EXCEPTION 'yield_kg cannot be negative';
      END IF;

      v_revenue := NULLIF(v_yield->>'revenue_usd','')::numeric;
      IF v_revenue IS NOT NULL AND v_revenue < 0 THEN
        RAISE EXCEPTION 'revenue_usd cannot be negative';
      END IF;
    END LOOP;
  END IF;
  -- ---------- end validation ----------

  IF v_is_create THEN
    -- Enumerators/admins create farmers for their own org
    v_org_id := public.get_user_org_id(v_uid);
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'User has no organization';
    END IF;
    IF NOT (
      public.has_role(v_uid, 'developer'::public.app_role)
      OR public.has_role(v_uid, 'admin'::public.app_role, v_org_id)
      OR public.has_role(v_uid, 'super_admin'::public.app_role, v_org_id)
      OR public.has_role(v_uid, 'enumerator'::public.app_role, v_org_id)
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;

    INSERT INTO public.farmers (
      organization_id, enrolled_by, status,
      first_name, last_name, phone, email,
      date_of_birth, gender, national_id,
      region, district, ward, village,
      farm_name, farm_size_hectares,
      primary_crops, primary_livestock,
      annual_income, has_bank_account, bank_name, mobile_money_provider,
      notes
    ) VALUES (
      v_org_id, v_uid, 'draft',
      _payload->>'first_name',
      _payload->>'last_name',
      NULLIF(_payload->>'phone',''),
      NULLIF(_payload->>'email',''),
      v_dob,
      NULLIF(_payload->>'gender',''),
      NULLIF(_payload->>'national_id',''),
      NULLIF(_payload->>'region',''),
      NULLIF(_payload->>'district',''),
      NULLIF(_payload->>'ward',''),
      NULLIF(_payload->>'village',''),
      NULLIF(_payload->>'farm_name',''),
      v_size,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_crops')), ARRAY[]::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_livestock')), ARRAY[]::text[]),
      v_income,
      COALESCE((_payload->>'has_bank_account')::boolean, false),
      NULLIF(_payload->>'bank_name',''),
      NULLIF(_payload->>'mobile_money_provider',''),
      NULLIF(_payload->>'notes','')
    )
    RETURNING id INTO v_farmer_id;
  ELSE
    -- Edit: rely on can_edit_farmer to enforce ownership + role + state gate
    IF NOT public.can_edit_farmer(v_farmer_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    SELECT organization_id INTO v_org_id FROM public.farmers WHERE id = v_farmer_id;

    UPDATE public.farmers SET
      first_name           = _payload->>'first_name',
      last_name            = _payload->>'last_name',
      phone                = NULLIF(_payload->>'phone',''),
      email                = NULLIF(_payload->>'email',''),
      date_of_birth        = v_dob,
      gender               = NULLIF(_payload->>'gender',''),
      national_id          = NULLIF(_payload->>'national_id',''),
      region               = NULLIF(_payload->>'region',''),
      district             = NULLIF(_payload->>'district',''),
      ward                 = NULLIF(_payload->>'ward',''),
      village              = NULLIF(_payload->>'village',''),
      farm_name            = NULLIF(_payload->>'farm_name',''),
      farm_size_hectares   = v_size,
      primary_crops        = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_crops')), ARRAY[]::text[]),
      primary_livestock    = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_livestock')), ARRAY[]::text[]),
      annual_income        = v_income,
      has_bank_account     = COALESCE((_payload->>'has_bank_account')::boolean, false),
      bank_name            = NULLIF(_payload->>'bank_name',''),
      mobile_money_provider= NULLIF(_payload->>'mobile_money_provider',''),
      notes                = NULLIF(_payload->>'notes','')
    WHERE id = v_farmer_id;

    DELETE FROM public.farmer_crops       WHERE farmer_id = v_farmer_id;
    DELETE FROM public.crop_yield_history WHERE farmer_id = v_farmer_id;
  END IF;

  -- Insert crops
  IF _crops IS NOT NULL AND jsonb_typeof(_crops) = 'array' THEN
    FOR v_crop IN SELECT * FROM jsonb_array_elements(_crops) LOOP
      INSERT INTO public.farmer_crops (farmer_id, organization_id, crop, position, farming_method)
      VALUES (
        v_farmer_id,
        v_org_id,
        v_crop->>'crop',
        COALESCE((v_crop->>'position')::int, 1),
        NULLIF(v_crop->>'farming_method','')
      );
    END LOOP;
  END IF;

  -- Insert yields
  IF _yields IS NOT NULL AND jsonb_typeof(_yields) = 'array' THEN
    FOR v_yield IN SELECT * FROM jsonb_array_elements(_yields) LOOP
      INSERT INTO public.crop_yield_history (farmer_id, organization_id, crop, year, yield_kg, revenue_usd)
      VALUES (
        v_farmer_id,
        v_org_id,
        v_yield->>'crop',
        (v_yield->>'year')::int,
        NULLIF(v_yield->>'yield_kg','')::numeric,
        NULLIF(v_yield->>'revenue_usd','')::numeric
      );
    END LOOP;
  END IF;

  RETURN v_farmer_id;
END;
$function$;