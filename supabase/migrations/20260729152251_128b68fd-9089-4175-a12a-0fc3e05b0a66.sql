-- Add last_error column and backfill misclassified rows.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS last_error text;

-- Rows revoked within 3 seconds of creation with no user attached were send-failures, not real revocations.
UPDATE public.invitations
SET status = 'failed',
    revoked_at = NULL,
    revoked_by = NULL,
    last_error = COALESCE(last_error, 'Auto-reclassified: original send failed')
WHERE status = 'revoked'
  AND invited_user_id IS NULL
  AND accepted_at IS NULL
  AND revoked_at IS NOT NULL
  AND revoked_at - created_at < interval '3 seconds';