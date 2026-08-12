-- 1. Catalog
CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  category text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_read" ON public.permissions FOR SELECT TO authenticated USING (true);

-- 2. Platform-wide defaults
CREATE TABLE public.role_permission_defaults (
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_key)
);
GRANT SELECT ON public.role_permission_defaults TO authenticated;
GRANT ALL ON public.role_permission_defaults TO service_role;
ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_defaults_read" ON public.role_permission_defaults FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_role_permission_defaults_updated_at
  BEFORE UPDATE ON public.role_permission_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Per-organization overrides
CREATE TABLE public.org_role_permissions (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, role, permission_key)
);
GRANT SELECT ON public.org_role_permissions TO authenticated;
GRANT ALL ON public.org_role_permissions TO service_role;
ALTER TABLE public.org_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_role_permissions_read" ON public.org_role_permissions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR organization_id = public.get_user_org_id(auth.uid())
  );
CREATE TRIGGER trg_org_role_permissions_updated_at
  BEFORE UPDATE ON public.org_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Seed catalog
INSERT INTO public.permissions (key, label, description, category, sort_order) VALUES
  ('farmers.onboard',     'Onboard farmers',                'Create new farmer records.', 'Farmers', 1),
  ('farmers.view_own',    'View own farmers',               'See farmer records they enrolled.', 'Farmers', 2),
  ('farmers.view_all',    'View all farmers',               'See every farmer record in the organization.', 'Farmers', 3),
  ('farmers.edit_any',    'Edit any farmer record',         'Edit farmers regardless of who enrolled them.', 'Farmers', 4),
  ('farmers.submit',      'Submit farmers for review',      'Move a draft or rejected record to submitted.', 'Farmers', 5),
  ('farmers.verify',      'Verify farmers',                 'Approve submitted farmer records.', 'Farmers', 6),
  ('farmers.reject',      'Reject farmers',                 'Send submitted records back with a reason.', 'Farmers', 7),
  ('farmers.reopen',      'Reopen a verified farmer',       'Return a verified record to submitted for changes.', 'Farmers', 8),
  ('farmers.export',      'Export farmers to CSV',          'Download the farmers list.', 'Farmers', 9),
  ('documents.upload',    'Upload farmer documents',        'Attach documents to a farmer record.', 'Documents', 1),
  ('documents.view',      'View farmer documents',          'Open and preview uploaded documents.', 'Documents', 2),
  ('documents.verify',    'Verify / reject documents',      'Approve or reject uploaded documents.', 'Documents', 3),
  ('analytics.farm_health','View farm health analytics',    'See the farm health score for a farmer.', 'Analytics', 1),
  ('analytics.org',       'View organization analytics',    'See organization-wide dashboards.', 'Analytics', 2),
  ('credit.view',         'View credit scores',             'See farmer credit scores and breakdowns.', 'Analytics', 3),
  ('credit.compute',      'Recompute credit scores',        'Trigger a fresh credit score calculation.', 'Analytics', 4),
  ('team.view',           'View team members',              'See the list of people in the organization.', 'Team', 1),
  ('team.invite',         'Invite users',                   'Send invitations to new members.', 'Team', 2),
  ('team.revoke',         'Revoke access',                  'Remove a member''s access to the organization.', 'Team', 3),
  ('team.manage_roles',   'Manage roles',                   'Change which role a member holds.', 'Team', 4),
  ('team.manage_permissions','Manage role permissions',     'Change these permission toggles.', 'Team', 5),
  ('org.settings',        'Manage organization settings',   'Edit organization-level settings.', 'Team', 6);

-- 5. Seed defaults
INSERT INTO public.role_permission_defaults (role, permission_key, enabled)
SELECT 'super_admin'::public.app_role, key, true FROM public.permissions;

INSERT INTO public.role_permission_defaults (role, permission_key, enabled)
SELECT 'admin'::public.app_role, key,
       key NOT IN ('farmers.reopen','team.invite','team.revoke','team.manage_roles','team.manage_permissions','org.settings')
  FROM public.permissions;

INSERT INTO public.role_permission_defaults (role, permission_key, enabled)
SELECT 'enumerator'::public.app_role, key,
       key IN ('farmers.onboard','farmers.view_own','farmers.submit','documents.upload','documents.view','analytics.farm_health')
  FROM public.permissions;

INSERT INTO public.role_permission_defaults (role, permission_key, enabled)
SELECT 'developer'::public.app_role, key, true FROM public.permissions;

-- 6. Resolver
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'developer'::public.app_role)
      OR EXISTS (
        SELECT 1
          FROM public.user_roles ur
          LEFT JOIN public.org_role_permissions orp
            ON orp.organization_id = _org_id
           AND orp.role = ur.role
           AND orp.permission_key = _perm
          LEFT JOIN public.role_permission_defaults rpd
            ON rpd.role = ur.role
           AND rpd.permission_key = _perm
         WHERE ur.user_id = _user_id
           AND (ur.organization_id = _org_id OR ur.role = 'developer'::public.app_role)
           AND COALESCE(orp.enabled, rpd.enabled, false)
      )
$$;

-- 7. Effective permissions for the caller
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(permission_key text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.key
    FROM public.permissions p
   WHERE public.has_permission(auth.uid(), p.key, public.get_user_org_id(auth.uid()))
$$;

-- 8. Writers
CREATE OR REPLACE FUNCTION public.set_role_permission(_org_id uuid, _role public.app_role, _permission_key text, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_dev boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role = 'developer'::public.app_role THEN
    RAISE EXCEPTION 'The developer role cannot be edited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = _permission_key) THEN
    RAISE EXCEPTION 'Unknown permission: %', _permission_key;
  END IF;

  v_is_dev := public.has_role(v_caller, 'developer'::public.app_role);

  IF _org_id IS NULL THEN
    IF NOT v_is_dev THEN
      RAISE EXCEPTION 'Only a platform developer can change platform defaults';
    END IF;
    INSERT INTO public.role_permission_defaults (role, permission_key, enabled)
    VALUES (_role, _permission_key, _enabled)
    ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
    RETURN;
  END IF;

  IF NOT v_is_dev THEN
    IF NOT public.has_role(v_caller, 'super_admin'::public.app_role, _org_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF NOT public.has_permission(v_caller, 'team.manage_permissions', _org_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF _role NOT IN ('admin'::public.app_role, 'enumerator'::public.app_role) THEN
      RAISE EXCEPTION 'Only a platform developer can change super admin permissions';
    END IF;
  END IF;

  INSERT INTO public.org_role_permissions (organization_id, role, permission_key, enabled, updated_by)
  VALUES (_org_id, _role, _permission_key, _enabled, v_caller)
  ON CONFLICT (organization_id, role, permission_key) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_role_permissions(_org_id uuid, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _org_id IS NULL THEN RAISE EXCEPTION 'Organization required'; END IF;
  IF NOT (
    public.has_role(v_caller, 'developer'::public.app_role)
    OR (
      public.has_role(v_caller, 'super_admin'::public.app_role, _org_id)
      AND public.has_permission(v_caller, 'team.manage_permissions', _org_id)
      AND _role IN ('admin'::public.app_role, 'enumerator'::public.app_role)
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.org_role_permissions
   WHERE organization_id = _org_id AND role = _role;
END;
$$;

-- 9. Write policies (RLS second gate; RPCs are the primary path)
CREATE POLICY "role_defaults_write_dev" ON public.role_permission_defaults
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'developer'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'developer'::public.app_role));

CREATE POLICY "org_role_permissions_write" ON public.org_role_permissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR (
      role IN ('admin'::public.app_role, 'enumerator'::public.app_role)
      AND public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
      AND public.has_permission(auth.uid(), 'team.manage_permissions', organization_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR (
      role IN ('admin'::public.app_role, 'enumerator'::public.app_role)
      AND public.has_role(auth.uid(), 'super_admin'::public.app_role, organization_id)
      AND public.has_permission(auth.uid(), 'team.manage_permissions', organization_id)
    )
  );

-- 10. Rewire existing checks to permissions
CREATE OR REPLACE FUNCTION public.can_view_farmer(_farmer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id = _farmer_id
      AND (
        public.has_permission(auth.uid(), 'farmers.view_all', f.organization_id)
        OR (
          f.enrolled_by = auth.uid()
          AND public.has_permission(auth.uid(), 'farmers.view_own', f.organization_id)
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_farmer(_farmer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.farmers f
    WHERE f.id = _farmer_id
      AND (
        public.has_permission(auth.uid(), 'farmers.edit_any', f.organization_id)
        OR (
          f.enrolled_by = auth.uid()
          AND f.status IN ('draft', 'rejected')
          AND public.has_permission(auth.uid(), 'farmers.onboard', f.organization_id)
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.farmers_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_nid boolean;
  v_has_land boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('submitted'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('verified','rejected'))
      OR (OLD.status = 'rejected'  AND NEW.status IN ('draft','submitted'))
      OR (OLD.status = 'verified'  AND NEW.status IN ('submitted'))
    ) THEN
      RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'submitted' AND OLD.status = 'verified'
       AND NOT public.has_permission(auth.uid(), 'farmers.reopen', NEW.organization_id) THEN
      RAISE EXCEPTION 'You do not have permission to reopen a verified record';
    END IF;

    IF NEW.status = 'verified'
       AND NOT public.has_permission(auth.uid(), 'farmers.verify', NEW.organization_id) THEN
      RAISE EXCEPTION 'You do not have permission to verify farmers';
    END IF;

    IF NEW.status = 'rejected'
       AND NOT public.has_permission(auth.uid(), 'farmers.reject', NEW.organization_id) THEN
      RAISE EXCEPTION 'You do not have permission to reject farmers';
    END IF;

    IF NEW.status = 'submitted' THEN
      IF NOT public.has_permission(auth.uid(), 'farmers.submit', NEW.organization_id)
         AND NOT public.has_permission(auth.uid(), 'farmers.edit_any', NEW.organization_id) THEN
        RAISE EXCEPTION 'You do not have permission to submit farmers for review';
      END IF;
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
$$;
