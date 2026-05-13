# Switch to Supabase `inviteUserByEmail`

Replace the custom invitations table flow with Supabase's built-in invite. Supabase sends the email; the invitee clicks the link, lands on a "set password" page, and is signed in.

## What changes

### Backend
1. **New server function** `inviteUser` (`src/lib/invitations.functions.ts`)
   - Protected with `requireSupabaseAuth`.
   - Verifies caller has `super_admin` or `developer` role in their org.
   - Calls `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { organization_id, role, invited_by, full_name? }, redirectTo: '<origin>/accept-invite' })`.
   - Inserts a row into `invitations` (status `pending`) for the admin UI list, keyed by the returned `user.id`.

2. **New server function** `revokeInvitation`
   - Calls `supabaseAdmin.auth.admin.deleteUser(user_id)` and deletes the `invitations` row.

3. **New server function** `resendInvitation`
   - Re-calls `inviteUserByEmail` for the same email; updates the row's `created_at`.

4. **DB migration** (small)
   - Add nullable `invited_user_id uuid` to `invitations` so we can map back to the auth user for revoke/resend.
   - Drop the `token` column usage (kept as nullable for backward compat or removed — see Open Question).
   - Add a trigger on `auth.users` insert: when `raw_user_meta_data` contains `organization_id` + `role`, populate `profiles.organization_id`, `profiles.full_name`, and insert into `user_roles`. Mark matching `invitations` row as `accepted`.

### Frontend
5. **`AdminInvitations.tsx`**
   - Replace direct `supabase.from('invitations').insert(...)` with `useServerFn(inviteUser)`.
   - Replace "Copy invite link" button with "Resend email".
   - Delete button calls `revokeInvitation`.

6. **New route `src/pages/AcceptInvite.tsx`** (mounted at `/accept-invite`)
   - User arrives with a Supabase recovery/invite session already established.
   - Shows "Set your password" form (+ optional full name).
   - Calls `supabase.auth.updateUser({ password, data: { full_name } })`.
   - Redirects to `/`.

7. **`Login.tsx`**
   - Remove the `accept-invite` mode and `?invite=<token>` handling (no longer used).
   - Keep sign-in and create-org modes.

## Email template
Supabase sends the default "You've been invited" email. Customize copy/branding later in the Supabase dashboard → Authentication → Email Templates → Invite User. No domain/SMTP setup required to start (uses Supabase's shared sender, rate-limited).

## Files touched
- new: `src/lib/invitations.functions.ts`
- new: `src/pages/AcceptInvite.tsx` + route registration in `App.tsx`
- edit: `src/pages/AdminInvitations.tsx`
- edit: `src/pages/Login.tsx`
- migration: alter `invitations`, add trigger on `auth.users`

## Open questions
1. Keep the `invitations` table for admin visibility (recommended), or remove it entirely and read invited users from `auth.admin.listUsers()`?
2. Should the trigger auto-assign role on first sign-in, or should `AcceptInvite.tsx` do it client-side after `updateUser`? (Trigger is more robust.)
