CREATE POLICY "Users can view their own invitation"
ON public.invitations
FOR SELECT
TO authenticated
USING (invited_user_id = auth.uid());