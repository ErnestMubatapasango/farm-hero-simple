# Organization creation: intended flow vs. what actually happens

## What is supposed to happen

1. On `/login` the user picks "Create Organization" and submits org name, full name, email, password.
2. `supabase.auth.signUp` creates the auth user. The `on_auth_user_created` trigger (`handle_invited_user`) runs: since there is no matching pending invitation, it creates a **bare profile** — no organization, no role. This is correct by design.
3. The org intent (`{name, full_name}`) is stashed in `localStorage` under `kyf_pending_org`.
4. Email confirmation is on, so `signUp` returns no session. The user clicks the confirmation link and lands back on the app with a session.
5. `AuthProvider` sees the session and calls `completePendingOrg`, which reads `localStorage` and calls the `create_organization` RPC. That RPC (security definer) inserts the organization, sets `profiles.organization_id`, and grants the caller `super_admin` in that org.
6. Roles refresh, and the user lands on the dashboard as `super_admin` of a real organization.

## What the data actually shows

- `organizations`: **0 rows**. `user_roles`: **0 rows**. `invitations`: 0 rows.
- One auth user, `enerst@digitalbots.agency`, created 11:17:32 UTC today, confirmed and signed in 15 seconds later.
- That user has a profile with `full_name` set but `organization_id = NULL` and **zero roles**.
- Postgres logs show **no errors** in the window — so `create_organization` was almost certainly never called, rather than called and failed.

Net effect: the account exists and can sign in, but has no org and no role, so the app treats them as a de-facto enumerator with an empty workspace. This matches the symptom reported earlier.

## Evaluation of the flow — the structural problems

1. **The org intent lives only in the browser that submitted the form.** Step 5 depends on `localStorage` surviving into the tab that handles the confirmation redirect. Confirming on a different device, a different browser, incognito, or after a redirect to a *different origin* (preview URL vs. published `kyf2.lovable.app` — Supabase falls back to the configured Site URL when `emailRedirectTo` is not in the allowed redirect list) all silently lose the intent. This is the most likely cause of the observed row, though it is not yet confirmed.
2. **Every failure is silent.** `completePendingOrg` returns `false` on any RPC error and shows the user nothing; the key is even kept on disk with no retry surface. `ProtectedRoute` then happily admits a session with no org and no role.
3. **No self-healing.** Nothing in the app notices "signed-in user with no organization and no roles" and offers to finish setup.
4. **`handle_new_user` is dead code** — only `handle_invited_user` is attached to `auth.users`, which is fine, but the leftover function is confusing.

## Proposed fix

### 1. Move org creation server-side (removes the localStorage dependency)

- Pass the org name in signup metadata: `options.data = { full_name, pending_org_name }`.
- Extend the `on_auth_user_created` trigger path: when there is **no** pending invitation and `raw_user_meta_data->>'pending_org_name'` is present, create the organization, link the profile, and insert the `super_admin` role right there. Org creation then happens atomically at signup, independent of which browser confirms the email.
- Keep `create_organization` as-is for the explicit/developer path.

### 2. Add a recovery screen for orphaned accounts

- New guard: signed-in user with `organization_id = NULL` and zero roles is routed to a small "Finish setting up your organization" screen that asks for the org name and calls `create_organization` directly.
- This fixes the existing orphaned account (`enerst@digitalbots.agency`) without manual SQL, and covers any future gap.

### 3. Stop swallowing errors

- `completePendingOrg` returns the error; `Login.tsx` and `AuthProvider` surface it as a visible message instead of a silent `false`.
- Keep the `localStorage` path as a secondary fallback but treat it as belt-and-braces, not the primary mechanism.

### 4. Confirm the redirect-origin theory

- Verify the preview and published origins are both in the Supabase allowed redirect URLs, and that Site URL matches where users actually sign up. If the confirmation link is bouncing users to a different origin, fix that too — it also affects password reset and invite acceptance.

### 5. Housekeeping

- Drop the unused `handle_new_user` function.

## Technical notes

- Files touched: `src/lib/pendingOrg.ts`, `src/pages/Login.tsx`, `src/hooks/useAuth.tsx`, `src/components/ProtectedRoute.tsx` (or a new `RequireOrg` guard), one new setup page, and a migration extending the `handle_invited_user` trigger plus dropping `handle_new_user`.
- No changes to `create_organization`'s signature, so existing callers keep working.
- Grants and RLS on `organizations` / `profiles` / `user_roles` are already correct — verified `create_organization` is executable by `authenticated` and the required unique indexes exist.
