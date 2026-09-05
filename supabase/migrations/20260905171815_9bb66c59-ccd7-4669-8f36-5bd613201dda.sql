DROP POLICY IF EXISTS "Editors can upload farmer doc files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update farmer doc files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete farmer doc files" ON storage.objects;

CREATE OR REPLACE FUNCTION public.farmer_documents_validate_file()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mime_type IS NOT NULL
     AND lower(NEW.mime_type) NOT IN ('application/pdf','image/png','image/jpeg') THEN
    RAISE EXCEPTION 'Unsupported file type %. Only PDF, PNG and JPEG are allowed.', NEW.mime_type;
  END IF;
  IF NEW.file_size IS NOT NULL AND NEW.file_size > 10485760 THEN
    RAISE EXCEPTION 'File is larger than the 10 MB limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS farmer_documents_validate_file ON public.farmer_documents;
CREATE TRIGGER farmer_documents_validate_file
BEFORE INSERT OR UPDATE ON public.farmer_documents
FOR EACH ROW EXECUTE FUNCTION public.farmer_documents_validate_file();