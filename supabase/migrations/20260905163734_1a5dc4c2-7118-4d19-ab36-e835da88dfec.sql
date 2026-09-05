-- 1. farmer_identities
CREATE TABLE public.farmer_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  national_id text NOT NULL,
  full_name text,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farmer_identities_national_id_unique UNIQUE (national_id),
  CONSTRAINT farmer_identities_national_id_format
    CHECK (national_id ~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$')
);

GRANT SELECT ON public.farmer_identities TO authenticated;
GRANT ALL ON public.farmer_identities TO service_role;

ALTER TABLE public.farmer_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Developers can view farmer identities"
  ON public.farmer_identities FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'developer'::public.app_role));

CREATE TRIGGER update_farmer_identities_updated_at
  BEFORE UPDATE ON public.farmer_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. link column
ALTER TABLE public.farmers
  ADD COLUMN identity_id uuid REFERENCES public.farmer_identities(id) ON DELETE RESTRICT;

CREATE INDEX idx_farmers_identity ON public.farmers(identity_id);

-- normalizer (immutable, safe in checks/indexes)
CREATE OR REPLACE FUNCTION public.normalize_national_id(_v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT NULLIF(upper(regexp_replace(coalesce(_v,''), '\s', '', 'g')), '') $$;

-- 3. backfill: one identity per distinct valid normalized national_id
WITH src AS (
  SELECT DISTINCT ON (public.normalize_national_id(national_id))
         public.normalize_national_id(national_id) AS nid,
         btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS full_name,
         date_of_birth
    FROM public.farmers
   WHERE public.normalize_national_id(national_id) ~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$'
   ORDER BY public.normalize_national_id(national_id), updated_at DESC
)
INSERT INTO public.farmer_identities (national_id, full_name, date_of_birth)
SELECT nid, NULLIF(full_name, ''), date_of_birth FROM src
ON CONFLICT (national_id) DO NOTHING;

UPDATE public.farmers f
   SET identity_id = i.id
  FROM public.farmer_identities i
 WHERE i.national_id = public.normalize_national_id(f.national_id)
   AND f.identity_id IS DISTINCT FROM i.id;

-- 4. at most one farmer record per person per org
CREATE UNIQUE INDEX uniq_farmers_org_identity
  ON public.farmers (organization_id, identity_id)
  WHERE identity_id IS NOT NULL;

-- require a valid, resolved identity once the record leaves draft
CREATE OR REPLACE FUNCTION public.farmers_require_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('submitted','verified') THEN
    IF public.normalize_national_id(NEW.national_id) IS NULL THEN
      RAISE EXCEPTION 'A national ID is required before a farmer can be submitted or verified';
    END IF;
    IF public.normalize_national_id(NEW.national_id) !~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$' THEN
      RAISE EXCEPTION 'National ID must look like 63-1234567A63';
    END IF;
    IF NEW.identity_id IS NULL THEN
      RAISE EXCEPTION 'This farmer is not linked to a national identity record yet; re-save the record to link it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER farmers_require_identity_trg
  BEFORE INSERT OR UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.farmers_require_identity();

-- 5. resolve (or create) a global identity
CREATE OR REPLACE FUNCTION public.resolve_farmer_identity(_national_id text, _full_name text, _dob date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nid text := public.normalize_national_id(_national_id);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_nid IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_nid !~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$' THEN
    RAISE EXCEPTION 'National ID must look like 63-1234567A63';
  END IF;

  INSERT INTO public.farmer_identities (national_id, full_name, date_of_birth)
  VALUES (v_nid, NULLIF(btrim(coalesce(_full_name,'')), ''), _dob)
  ON CONFLICT (national_id) DO UPDATE
     SET full_name     = COALESCE(public.farmer_identities.full_name, EXCLUDED.full_name),
         date_of_birth = COALESCE(public.farmer_identities.date_of_birth, EXCLUDED.date_of_birth)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_farmer_identity(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_farmer_identity(text, text, date) TO authenticated;

-- 6. onboarding lookup: never leaks other orgs' data
CREATE OR REPLACE FUNCTION public.check_farmer_identity(_national_id text)
RETURNS TABLE(known boolean, full_name text, date_of_birth date, in_my_org boolean, my_org_farmer_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_nid text := public.normalize_national_id(_national_id);
  v_identity public.farmer_identities;
  v_farmer_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_org := public.get_user_org_id(v_uid);

  IF v_nid IS NULL OR v_nid !~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::date, false, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_identity FROM public.farmer_identities WHERE national_id = v_nid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::date, false, NULL::uuid;
    RETURN;
  END IF;

  IF v_org IS NOT NULL THEN
    SELECT f.id INTO v_farmer_id
      FROM public.farmers f
     WHERE f.identity_id = v_identity.id
       AND f.organization_id = v_org
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT true, v_identity.full_name, v_identity.date_of_birth,
                      v_farmer_id IS NOT NULL, v_farmer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.check_farmer_identity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_farmer_identity(text) TO authenticated;

-- 7. save_farmer: validate national ID, resolve identity, block same-org duplicates
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
  v_nid text;
  v_identity_id uuid;
  v_existing uuid;
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
      RAISE EXCEPTION 'farm_size_hectares must be less than or equal to 100000';
    END IF;
  END IF;

  v_income := NULLIF(_payload->>'annual_income','')::numeric;
  IF v_income IS NOT NULL THEN
    IF v_income < 0 THEN
      RAISE EXCEPTION 'annual_income cannot be negative';
    END IF;
    IF v_income > 1000000000 THEN
      RAISE EXCEPTION 'annual_income must be less than or equal to 1000000000';
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

  v_nid := public.normalize_national_id(_payload->>'national_id');
  IF v_nid IS NULL THEN
    RAISE EXCEPTION 'A valid national ID is required';
  END IF;
  IF v_nid !~ '^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$' THEN
    RAISE EXCEPTION 'National ID must look like 63-1234567A63';
  END IF;

  IF _yields IS NOT NULL AND jsonb_typeof(_yields) = 'array' THEN
    FOR v_yield IN SELECT * FROM jsonb_array_elements(_yields) LOOP
      v_year := NULLIF(v_yield->>'year','')::int;
      IF v_year IS NULL OR v_year < 1980 OR v_year > v_this_year THEN
        RAISE EXCEPTION 'yield year must be between 1980 and %', v_this_year;
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

  v_identity_id := public.resolve_farmer_identity(
    v_nid,
    btrim(coalesce(_payload->>'first_name','') || ' ' || coalesce(_payload->>'last_name','')),
    v_dob
  );

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

    SELECT id INTO v_existing
      FROM public.farmers
     WHERE organization_id = v_org_id AND identity_id = v_identity_id
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'This national ID is already enrolled in your organization';
    END IF;

    INSERT INTO public.farmers (
      organization_id, enrolled_by, status,
      first_name, last_name, phone, email,
      date_of_birth, gender, national_id, identity_id,
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
      v_nid,
      v_identity_id,
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

    SELECT id INTO v_existing
      FROM public.farmers
     WHERE organization_id = v_org_id
       AND identity_id = v_identity_id
       AND id <> v_farmer_id
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'This national ID is already enrolled in your organization';
    END IF;

    UPDATE public.farmers SET
      first_name           = _payload->>'first_name',
      last_name            = _payload->>'last_name',
      phone                = NULLIF(_payload->>'phone',''),
      email                = NULLIF(_payload->>'email',''),
      date_of_birth        = v_dob,
      gender               = NULLIF(_payload->>'gender',''),
      national_id          = v_nid,
      identity_id          = v_identity_id,
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