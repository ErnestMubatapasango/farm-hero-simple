ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

UPDATE public.profiles
SET first_name = NULLIF(split_part(btrim(full_name), ' ', 1), ''),
    last_name = NULLIF(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
WHERE full_name IS NOT NULL
  AND btrim(full_name) <> ''
  AND (first_name IS NULL OR btrim(first_name) = '');

CREATE OR REPLACE FUNCTION public.profiles_sync_full_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.first_name IS NOT NULL AND btrim(NEW.first_name) <> '' THEN
    NEW.full_name := btrim(btrim(NEW.first_name) || ' ' || COALESCE(btrim(NEW.last_name), ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_full_name_trigger ON public.profiles;
CREATE TRIGGER profiles_sync_full_name_trigger
BEFORE INSERT OR UPDATE OF first_name, last_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_full_name();