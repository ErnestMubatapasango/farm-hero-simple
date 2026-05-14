
-- ============ farmer_documents ============
CREATE TABLE public.farmer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('id','land_title','receipt','insurance','photo','other')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  verified_by uuid,
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_farmer_documents_farmer ON public.farmer_documents(farmer_id);
CREATE INDEX idx_farmer_documents_org ON public.farmer_documents(organization_id);

ALTER TABLE public.farmer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view farmer documents"
ON public.farmer_documents FOR SELECT TO authenticated
USING (organization_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Editors can insert farmer documents"
ON public.farmer_documents FOR INSERT TO authenticated
WITH CHECK (
  can_edit_farmer(farmer_id)
  AND uploaded_by = auth.uid()
  AND organization_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Admins can update farmer documents"
ON public.farmer_documents FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (uploaded_by = auth.uid() AND can_edit_farmer(farmer_id))
);

CREATE POLICY "Editors can delete farmer documents"
ON public.farmer_documents FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
  OR (uploaded_by = auth.uid() AND can_edit_farmer(farmer_id))
);

CREATE TRIGGER trg_farmer_documents_updated_at
BEFORE UPDATE ON public.farmer_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ credit_scores ============
CREATE TABLE public.credit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  score integer NOT NULL,
  band text NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  inputs_hash text,
  computed_by uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_scores_org ON public.credit_scores(organization_id);

ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view credit scores"
ON public.credit_scores FOR SELECT TO authenticated
USING (organization_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Org members can insert credit scores"
ON public.credit_scores FOR INSERT TO authenticated
WITH CHECK (organization_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Org members can update credit scores"
ON public.credit_scores FOR UPDATE TO authenticated
USING (organization_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'developer'::app_role));

CREATE POLICY "Super admins can delete credit scores"
ON public.credit_scores FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role, organization_id)
  OR has_role(auth.uid(), 'developer'::app_role)
);

CREATE TRIGGER trg_credit_scores_updated_at
BEFORE UPDATE ON public.credit_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Storage bucket ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('farmer-documents', 'farmer-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: extract farmer_id (second folder) from object name
-- Path layout: {organization_id}/{farmer_id}/{document_id}.{ext}

CREATE POLICY "Org members can read farmer doc files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND (
    ((storage.foldername(name))[1])::uuid = get_user_org_id(auth.uid())
    OR has_role(auth.uid(), 'developer'::app_role)
  )
);

CREATE POLICY "Editors can upload farmer doc files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'farmer-documents'
  AND can_edit_farmer(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY "Admins can delete farmer doc files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'super_admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'developer'::app_role)
    OR can_edit_farmer(((storage.foldername(name))[2])::uuid)
  )
);
