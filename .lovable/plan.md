
## Diagnosis (verified)

Two rows created in the last hour (`rmilikafu263@gmail.com`, `info@digitalbots.agency`) are stamped `status='revoked'` within ~400ms of `created_at`, by the same `invited_by` user. This matches exactly one code path in `supabase/functions/invite-user/index.ts`:

```ts
const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(...)
if (inviteErr) {
  await admin.from("invitations").update({ status: "revoked", ... })  // ← the bug
  return json({ error: "Invitation could not be sent" }, 400)
}
```

So `inviteUserByEmail` is throwing and the row is being marked `revoked` as a side-effect. Confirmed contributing causes:

1. `rmilikafu263@gmail.com` already exists in `auth.users` (they created an organization earlier in the day). `inviteUserByEmail` rejects existing users → the row is revoked.
2. `info@digitalbots.agency` is not in `auth.users`, so the failure is elsewhere — most likely Supabase's built-in invite rate limit (two attempts 10s apart, and the account also has a legacy invite from May) or the newly-added SMTP config. The current code swallows the real error, so we can't tell which without instrumentation.

Downstream UI effect: the Invitations page correctly shows those rows in the "Revoked" tab, so admins believe they revoked them, when in fact the send silently failed.

## Fix

### 1. Stop marking failed sends as `revoked`

`revoked` should only mean "an authorized user chose to deactivate this invitation". Failed sends need a separate state.

- Add `'failed'` to the invitation status set (either extend the enum/check constraint, or if `status` is free-text, just start writing `'failed'`). Include a `last_error text` column for admin debugging.
- In `invite-user` when `inviteUserByEmail` errors:
  - Set `status='failed'`, `last_error=<message>` on the row instead of `revoked`.
  - Return the real Supabase error message (not the generic string) so the toast in `AdminInvitations` can surface it.
  - `console.error` the failure so edge function logs capture it.

### 2. Handle "user already exists" as a first-class case

Before calling `inviteUserByEmail`, look up the email in `auth.users` (service-role admin API). If a user exists:
  - If they already have a profile + role in the caller's org → return a friendly `409 "Already a member"` and don't insert a row.
  - If they exist but aren't in this org → insert the invitation row with `status='pending'` and `invited_user_id` set to the existing user id, then use `admin.auth.admin.generateLink({ type: 'invite' })` (or send a magic link) so they can accept without needing signup. The existing `handle_invited_user` trigger only runs on INSERT, so we also need `AcceptInvite.tsx` / an accept RPC path that handles the "already-authenticated existing user accepts a fresh invite" case (this already exists via `accept_my_invitation`).

### 3. Surface failures in the UI

- `AdminInvitations.tsx`: show the `failed` invitations in a distinct tab or badge, include `last_error` in the row, offer a "Retry" action (which calls the existing `resend` path but from a `failed` row rather than `pending`).
- Toast the real backend error string on invite submit instead of the current generic one.

### 4. Clean up the historical bad rows

One-shot migration (or manual SQL) to relabel the 4 rows that were revoked within 2 seconds of creation and never had an `invited_user_id`:

```sql
UPDATE public.invitations
SET status = 'failed', revoked_at = NULL, revoked_by = NULL
WHERE status = 'revoked'
  AND invited_user_id IS NULL
  AND accepted_at IS NULL
  AND revoked_at - created_at < interval '3 seconds';
```

### 5. Verify with a live test

After the code change:
- Re-invite `info@digitalbots.agency` and read the returned error string + edge function logs to confirm the underlying cause (SMTP vs rate limit vs other). Address whichever it is.
- Invite a brand-new address to confirm the happy path still works end-to-end (row stays `pending`, email arrives, `AcceptInvite` flow completes).
- Invite `rmilikafu263@gmail.com` again to confirm the "existing user" branch produces a clear error and does not poison a row.

## Technical notes

- Files touched:
  - `supabase/functions/invite-user/index.ts` — new error handling, existing-user branch, real error surfacing, `console.error`.
  - `supabase/migrations/<new>.sql` — add `last_error` column, allow `'failed'` status, backfill bad rows.
  - `src/pages/AdminInvitations.tsx` — new `failed` tab/badge, retry action, real-error toast.
- `revoke_invitation` RPC does not need changes; the `failed` state never enters the "accepted → revoke" branch.
- No changes needed to `handle_invited_user` trigger or `accept_my_invitation` RPC.

Once approved, I'll implement the change, run a live invite test via Playwright, and report the actual root cause for the `info@digitalbots.agency` failures with the improved error message.
