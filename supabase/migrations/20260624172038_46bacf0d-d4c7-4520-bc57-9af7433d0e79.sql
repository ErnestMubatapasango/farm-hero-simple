
-- Add UPDATE policy on storage.objects for farmer-documents (mirror DELETE policy)
CREATE POLICY "Admins can update farmer doc files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'farmer-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'super_admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'developer'::app_role)
    OR can_edit_farmer(((storage.foldername(name))[2])::uuid)
  )
)
WITH CHECK (
  bucket_id = 'farmer-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'super_admin'::app_role, ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'developer'::app_role)
    OR can_edit_farmer(((storage.foldername(name))[2])::uuid)
  )
);

-- Restrict Realtime channel subscriptions: only authenticated users, only for topics
-- matching their own user id or organization id. This prevents cross-org snooping
-- on invitations/notifications change streams.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to their own topics" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to their own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('invite-revoke-' || auth.uid()::text)
  OR realtime.topic() = ('notifications-' || auth.uid()::text)
  OR realtime.topic() LIKE ('org-' || COALESCE(public.get_user_org_id(auth.uid())::text, '00000000-0000-0000-0000-000000000000') || '%')
);
