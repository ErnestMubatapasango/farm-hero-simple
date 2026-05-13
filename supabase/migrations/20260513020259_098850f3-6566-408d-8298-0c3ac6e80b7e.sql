
-- 1) Add invited_user_id, make token nullable
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS invited_user_id uuid;

ALTER TABLE public.invitations
  ALTER COLUMN token DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_invited_user_id
  ON public.invitations(invited_user_id);

-- 2) Trigger function: when a new auth user has invitation metadata, wire them up
CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role public.app_role;
  v_full_name text;
BEGIN
  v_org_id := NULLIF(NEW.raw_user_meta_data ->> 'organization_id', '')::uuid;
  v_role := NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.app_role;
  v_full_name := NEW.raw_user_meta_data ->> 'full_name';

  -- Always ensure a profile row exists (mirrors handle_new_user)
  INSERT INTO public.profiles (user_id, full_name, organization_id)
  VALUES (NEW.id, v_full_name, v_org_id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        organization_id = COALESCE(EXCLUDED.organization_id, public.profiles.organization_id);

  IF v_org_id IS NOT NULL AND v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, v_org_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.invitations
       SET status = 'accepted',
           accepted_at = now(),
           invited_user_id = NEW.id
     WHERE email = NEW.email
       AND organization_id = v_org_id
       AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- Add unique constraint on profiles.user_id if missing (needed for ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_user_id_key' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3) Replace the existing on_auth_user_created trigger with the richer handler
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_invited_user();
