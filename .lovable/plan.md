# Soft-deactivate revoked invitees + admin re-auth

## Goals

1. Removing an enumerator/admin from the Invitations list must **not** delete farmers they enrolled and must **not** lose attribution.
2. The revoked user must immediately lose all access to the platform.
3. Before any revoke happens, the acting super_admin re-enters their password to confirm intent.

## Behavior matrix (after change)

| Invitation state | What "Remove" does |
|---|---|
| `pending` | Delete the auth user (no profile/role yet) and delete the invitations row. Unchanged from today. |
| `accepted` | Delete the user's `user_roles` row(s) for this org, mark the invitation `revoked` with `revoked_at`/`revoked_by`. Keep `auth.users`, `profiles`, and all `farmers` rows intact so `enrolled_by` still resolves to a real name. The user can no longer log in to anything in this org (no role = `get_user_org_id` returns null and every RLS check fails). |

The user keeps existing in `auth.users` for attribution only. They cannot enrol farmers, view data, or be re-invited under the same row (a fresh invite creates a new invitations row).

## Changes

### 1. Database (migration)

- `invitations`: add `revoked_at timestamptz`, `revoked_by uuid`. Allow `'revoked'` as a valid status value.
- New SECURITY DEFINER RPC `revoke_invitation(_invitation_id uuid)`:
  - Verifies caller is `super_admin` of the invitation's org (or `developer`).
  - If status = `pending` and `invited_user_id` is set → call nothing here; the edge function handles auth user delete (kept in edge fn because RPC can't touch `auth.users`).
  - If status = `accepted` → delete matching `user_roles` rows for `(invited_user_id, organization_id)`, set invitation `status='revoked'`, `revoked_at=now()`, `revoked_by=auth.uid()`.
- Realtime already enabled on `invitations` from the previous migration.

### 2. Edge function `invite-user` — `revoke` action

Replace current behavior:

```text
if status == 'pending':
    auth.admin.deleteUser(invited_user_id)
    delete invitations row
else if status == 'accepted':
    call rpc revoke_invitation(invitation_id)   # soft deactivate
else:
    no-op
```

The auth user is preserved on accepted revokes so `profiles.full_name` keeps resolving for `farmers.enrolled_by`.

### 3. Admin re-authentication before revoke

In `AdminInvitations.tsx`, when the super_admin clicks "Remove":

1. Open a confirmation dialog that shows:
   - Invitee name + email + role
   - Plain-language consequence ("They will lose access immediately. Farmers they enrolled will remain in your organization.")
   - A password field for the acting admin.
2. On confirm, call `supabase.auth.signInWithPassword({ email: currentUser.email, password })` against the *current* session's email. This is a fresh credential check — Supabase returns an error if the password is wrong without disturbing the session.
3. Only on success, call the `revoke` edge function action.
4. On failure, show inline error and do not call revoke.

(We use `signInWithPassword` purely as a credential probe — it does not affect the active session beyond refreshing tokens.)

### 4. UI surface

- Status pill gains a third state `revoked` (muted gray with a slashed-circle icon).
- Accepted-invitee row continues to show "Accepted by {name} · {timestamp}". Revoked-invitee row shows "Access revoked · {timestamp} by {admin name}".
- The "Remove" button is hidden once status = `revoked`.

## Out of scope (not changed in this plan)

- No farmer reassignment UI. `farmers.enrolled_by` still points to the (now access-less) user; their name still appears on each farmer card via the existing profile join.
- No bulk-revoke.
- No way to re-activate a revoked user — re-invite via a new invitation row instead.

## Files touched

- New migration (add columns, RPC).
- `supabase/functions/invite-user/index.ts` — new revoke branch logic.
- `src/pages/AdminInvitations.tsx` — confirmation dialog with password re-auth, render `revoked` state.
