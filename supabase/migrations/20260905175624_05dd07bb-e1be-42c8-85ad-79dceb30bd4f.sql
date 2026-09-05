CREATE OR REPLACE FUNCTION public.export_farmers(
  _org_id uuid,
  _status text DEFAULT 'all',
  _search text DEFAULT NULL,
  _sort text DEFAULT 'newest'
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  region text,
  district text,
  ward text,
  village text,
  farm_name text,
  farm_size_hectares numeric,
  primary_crops text[],
  primary_livestock text[],
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_like text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required';
  END IF;

  IF NOT public.has_permission(v_uid, 'farmers.export', _org_id) THEN
    RAISE EXCEPTION 'Not permitted: farmers.export';
  END IF;

  v_like := CASE
    WHEN _search IS NULL OR btrim(_search) = '' THEN NULL
    ELSE '%' || btrim(_search) || '%'
  END;

  RETURN QUERY
  SELECT f.id, f.first_name, f.last_name, f.phone, f.region, f.district, f.ward,
         f.village, f.farm_name, f.farm_size_hectares, f.primary_crops,
         f.primary_livestock, f.status, f.created_at
    FROM public.farmers f
   WHERE f.organization_id = _org_id
     AND (_status IS NULL OR _status = 'all' OR f.status = _status)
     AND (
       v_like IS NULL
       OR f.first_name ILIKE v_like
       OR f.last_name ILIKE v_like
       OR f.phone ILIKE v_like
       OR f.farm_name ILIKE v_like
       OR f.ward ILIKE v_like
       OR f.village ILIKE v_like
       OR f.region ILIKE v_like
       OR f.district ILIKE v_like
     )
   ORDER BY
     CASE WHEN _sort = 'name_asc' THEN f.first_name END ASC,
     CASE WHEN _sort = 'name_desc' THEN f.first_name END DESC,
     CASE WHEN _sort = 'status' THEN f.status END ASC,
     CASE WHEN _sort = 'oldest' THEN f.created_at END ASC,
     CASE WHEN _sort NOT IN ('name_asc','name_desc','status','oldest') THEN f.created_at END DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.export_farmers(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_farmers(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.export_farmers(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_farmers(uuid, text, text, text) TO service_role;