-- Remove overly broad org-wide read policy on farmer document files; rely on the
-- farmer-ownership-aware policy 'farmer-documents-select' instead.
DROP POLICY IF EXISTS "Org members can read farmer doc files" ON storage.objects;

-- Restrict the admin update policy to authenticated role only.
DROP POLICY IF EXISTS "Admins can update farmer doc files" ON storage.objects;

CREATE POLICY "Admins can update farmer doc files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'farmer-documents'
  AND (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(
      auth.uid(),
      'admin'::public.app_role,
      ((storage.foldername(name))[1])::uuid
    )
    OR public.has_role(
      auth.uid(),
      'super_admin'::public.app_role,
      ((storage.foldername(name))[1])::uuid
    )
  )
)
WITH CHECK (
  bucket_id = 'farmer-documents'
  AND (
    public.has_role(auth.uid(), 'developer'::public.app_role)
    OR public.has_role(
      auth.uid(),
      'admin'::public.app_role,
      ((storage.foldername(name))[1])::uuid
    )
    OR public.has_role(
      auth.uid(),
      'super_admin'::public.app_role,
      ((storage.foldername(name))[1])::uuid
    )
  )
);