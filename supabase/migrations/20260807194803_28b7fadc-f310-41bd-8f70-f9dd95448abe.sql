CREATE OR REPLACE FUNCTION public.farmers_state_machine()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_nid boolean;
  v_has_land boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('verified','rejected'))
      OR (OLD.status = 'rejected'  AND NEW.status IN ('draft','submitted'))
      OR (OLD.status = 'verified'  AND NEW.status IN ('submitted')
          AND public.has_role(auth.uid(),'super_admin'::public.app_role, NEW.organization_id))
    ) THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'submitted' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.farmer_documents
         WHERE farmer_id = NEW.id
           AND document_type IN ('id','national_id')
           AND status <> 'rejected'
      ) INTO v_has_nid;
      SELECT EXISTS (
        SELECT 1 FROM public.farmer_documents
         WHERE farmer_id = NEW.id
           AND document_type = 'land_title'
           AND status <> 'rejected'
      ) INTO v_has_land;
      IF NOT (v_has_nid AND v_has_land) THEN
        RAISE EXCEPTION 'National ID and Land Title documents are required to submit for review';
      END IF;
      NEW.submitted_at := now();
    END IF;
  END IF;

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
$function$;