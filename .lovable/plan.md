## Root cause

Verified against the DB: the most recent create-org signup (`rmilikafu263@gmail.com`, confirmed) has a `profiles` row with `organization_id = NULL` and zero rows in `user_roles`. The organization was never created.

The bug is in the email-confirmation branch of `src/pages/Login.tsx`:

1. User submits Create Organization → `supabase.auth.signUp()` returns no session (email confirmation is on).
2. Login stashes `kyf_pending_org` in `localStorage` and shows "Check your email…".
3. User clicks the confirmation link. Supabase establishes a session on that redirect. Because `emailRedirectTo` is `window.location.origin` (i.e. `/`), the app lands on Dashboard already signed in — **`handleSignIn` never runs**, so the `kyf_pending_org` completion code that calls `create_organization` never executes.
4. Even if the user later navigates to `/login`, the `if (session) return <Navigate to="/">` guard redirects them away before `handleSignIn` can process the pending org.

Result: confirmed user with a bare profile, no org, no role. The "user acts as enumerator" the user described is just the UI's fallback when `roles` is empty — the real defect is the missing org + role.

The "role: user" text the user saw is not an app_role (the enum is `developer | super_admin | admin | enumerator`) — it's almost certainly the sidebar/profile fallback string when `roles` is empty. Fixing the org creation makes it moot, and we'll double-check the fallback while we're there.

## Fix

Move the pending-org completion out of `handleSignIn` and into the auth bootstrap so it runs whenever a session appears with `kyf_pending_org` present — email-confirmation redirect, sign-in, or reload.

### Changes

1. **New helper `src/lib/pendingOrg.ts`**
   - `completePendingOrg(userId): Promise<boolean>` — reads `kyf_pending_org` from localStorage, calls `supabase.rpc('create_organization', { _name, _slug })`, updates `profiles.full_name` if provided, clears the localStorage key on success, and returns whether an org was created. Idempotent: also clears the key when the RPC fails with "User already belongs to an organization" so we don't loop.

2. **`src/hooks/useAuth.tsx`**
   - In the `onAuthStateChange` and `getSession` branches, after `fetchRolesAndOrg` when `roles` and `organizationId` both come back empty, call `completePendingOrg(uid)`; if it returns true, run `fetchRolesAndOrg` again so context reflects the new super_admin role + org before any route decision.
   - Do this before flipping `loading` to false on the initial mount so `ProtectedRoute` doesn't render Dashboard with the empty role set.

3. **`src/pages/Login.tsx`**
   - Remove the pending-org completion block from `handleSignIn` (now handled centrally).
   - Keep the signup branch that stashes `kyf_pending_org` and shows the "Check your email" message.
   - Keep the immediate-session branch (email confirmation disabled) but have it call the shared `completePendingOrg` helper for consistency instead of an inline RPC call.

4. **Backfill the stuck user** (data fix, not schema)
   - For `rmilikafu263@gmail.com` (id `b447daec-…`): confirm with the user whether to (a) call `create_organization` on their behalf using an org name they provide, or (b) leave it and let them retry after the fix ships. No code change needed here — flagged so we don't forget the one broken account.

5. **Sanity check the "user" label**
   - Grep for a `"user"` fallback string in sidebar/profile UI and, if present, change it to `"No role"` / hide it, so the display can't misrepresent a role-less account as an enumerator/user. Purely cosmetic; only touched if such a fallback exists.

### Out of scope

- No schema, RLS, or RPC changes. `create_organization` already does the right thing atomically.
- No changes to the invite flow.

### Verification

- Sign up a fresh email with confirmation on → click email link → land on Dashboard → confirm `organizations` row exists, `profiles.organization_id` is set, and `user_roles` has `super_admin` for that user + org.
- Repeat with confirmation off (immediate session) → same result via the Login sign-up path.
- Reload while signed in with no `kyf_pending_org` → nothing happens, no extra RPC calls.
