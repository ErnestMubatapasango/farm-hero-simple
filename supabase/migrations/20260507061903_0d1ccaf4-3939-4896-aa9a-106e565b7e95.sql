
-- =============================================
-- FARMERS TABLE
-- =============================================
CREATE TABLE public.farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrolled_by UUID NOT NULL REFERENCES auth.users(id),

  -- Personal info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  date_of_birth DATE,
  gender TEXT,
  national_id TEXT,

  -- Location
  county TEXT,
  sub_county TEXT,
  ward TEXT,
  village TEXT,

  -- Farm info
  farm_name TEXT,
  farm_size_acres NUMERIC,
  farming_type TEXT DEFAULT 'mixed',
  primary_crops TEXT[] DEFAULT '{}',
  primary_livestock TEXT[] DEFAULT '{}',

  -- Financial
  annual_income NUMERIC,
  has_bank_account BOOLEAN DEFAULT false,
  bank_name TEXT,
  mobile_money_provider TEXT,

  -- Status & verification
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_farmers_org ON public.farmers(organization_id);
CREATE INDEX idx_farmers_status ON public.farmers(status);
CREATE INDEX idx_farmers_enrolled_by ON public.farmers(enrolled_by);

-- RLS Policies
CREATE POLICY "Org members can view farmers"
  ON public.farmers FOR SELECT TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Enumerators can create farmers in their org"
  ON public.farmers FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id = get_user_org_id(auth.uid()) AND enrolled_by = auth.uid())
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Admins can update farmers in their org"
  ON public.farmers FOR UPDATE TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    ))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Super admins can delete farmers in their org"
  ON public.farmers FOR DELETE TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

-- Updated_at trigger
CREATE TRIGGER update_farmers_updated_at
  BEFORE UPDATE ON public.farmers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INVITATIONS TABLE
-- =============================================
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_invitations_org ON public.invitations(organization_id);
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- RLS Policies
CREATE POLICY "Super admins can view org invitations"
  ON public.invitations FOR SELECT TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()) AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    ))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Super admins can create invitations"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Super admins can update invitations"
  ON public.invitations FOR UPDATE TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
    OR has_role(auth.uid(), 'developer'::app_role)
  );

CREATE POLICY "Super admins can delete invitations"
  ON public.invitations FOR DELETE TO authenticated
  USING (
    (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'super_admin'::app_role))
    OR has_role(auth.uid(), 'developer'::app_role)
  );
