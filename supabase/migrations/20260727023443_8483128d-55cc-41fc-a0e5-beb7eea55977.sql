
-- ============================================================================
-- save_farmer: atomic upsert of farmer + crops + yield history
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_farmer(
  _farmer_id uuid,
  _payload jsonb,
  _crops jsonb,
  _yields jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_farmer_id uuid := _farmer_id;
  v_is_create boolean := (_farmer_id IS NULL);
  v_crop jsonb;
  v_yield jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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
      NULLIF(_payload->>'date_of_birth','')::date,
      NULLIF(_payload->>'gender',''),
      NULLIF(_payload->>'national_id',''),
      NULLIF(_payload->>'region',''),
      NULLIF(_payload->>'district',''),
      NULLIF(_payload->>'ward',''),
      NULLIF(_payload->>'village',''),
      NULLIF(_payload->>'farm_name',''),
      NULLIF(_payload->>'farm_size_hectares','')::numeric,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_crops')), ARRAY[]::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_livestock')), ARRAY[]::text[]),
      NULLIF(_payload->>'annual_income','')::numeric,
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
      date_of_birth        = NULLIF(_payload->>'date_of_birth','')::date,
      gender               = NULLIF(_payload->>'gender',''),
      national_id          = NULLIF(_payload->>'national_id',''),
      region               = NULLIF(_payload->>'region',''),
      district             = NULLIF(_payload->>'district',''),
      ward                 = NULLIF(_payload->>'ward',''),
      village              = NULLIF(_payload->>'village',''),
      farm_name            = NULLIF(_payload->>'farm_name',''),
      farm_size_hectares   = NULLIF(_payload->>'farm_size_hectares','')::numeric,
      primary_crops        = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_crops')), ARRAY[]::text[]),
      primary_livestock    = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'primary_livestock')), ARRAY[]::text[]),
      annual_income        = NULLIF(_payload->>'annual_income','')::numeric,
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
$$;

REVOKE ALL ON FUNCTION public.save_farmer(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_farmer(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- create_organization: atomic org creation + super_admin grant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_organization(
  _name text,
  _slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_clean_slug text;
  v_existing_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name required';
  END IF;

  v_clean_slug := lower(regexp_replace(COALESCE(NULLIF(trim(_slug), ''), _name), '[^a-z0-9]+', '-', 'g'));
  v_clean_slug := regexp_replace(v_clean_slug, '(^-|-$)', '', 'g');
  IF length(v_clean_slug) = 0 THEN
    v_clean_slug := 'org-' || substr(v_uid::text, 1, 8);
  END IF;

  -- Prevent a user from creating a second org through this RPC when they
  -- already belong to one. Invited users have organization_id set; developers
  -- may still create multiple orgs.
  SELECT organization_id INTO v_existing_org FROM public.profiles WHERE user_id = v_uid;
  IF v_existing_org IS NOT NULL AND NOT public.has_role(v_uid, 'developer'::public.app_role) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (trim(_name), v_clean_slug, v_uid)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (user_id, organization_id)
  VALUES (v_uid, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id;

  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (v_uid, v_org_id, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, organization_id, role) DO NOTHING;

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
