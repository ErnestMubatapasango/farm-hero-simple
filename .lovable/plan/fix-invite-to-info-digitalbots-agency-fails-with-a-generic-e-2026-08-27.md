# Fix: invite to info@digitalbots.agency fails with a generic Edge Function error

## What is actually happening

Verified against the live project:

- An auth user for `info@digitalbots.agency` already exists — created 23 Aug 2026, email confirmed 27 Aug 07:28.
- That user has **no rows in `user_roles`** and **no invitation row** (the `invitations` table has zero rows for this email).
- The `invite-user` function logs show only boot/shutdown for the attempt — no internal error. That means it exited on its early "user already exists" branch and returned HTTP 409 with the message: *"This email is already registered with another account…"*.
- The UI never shows that message: `callInviteFn` in `AdminInvitations.tsx` reads `error.message` from `supabase.functions.invoke`, which for any non-2xx is the generic *"Edge Function returned a non-2xx status code"*. The real JSON body is discarded.

So two separate problems: a leftover orphan account blocks the invite, and the reason is invisible in the UI.

## Fix 1 — show the real reason in the UI

In `callInviteFn`, when `invoke` returns a `FunctionsHttpError`, read `error.context.json()` (fall back to text) and throw that `error` field instead of the generic message. Result: the admin sees "This email is already registered with another account…" or "already a member of your organization" instead of "Failed to send a request to the Edge Function".

## Fix 2 — allow re-inviting an orphaned account

An existing auth user with **no `user_roles` rows at all** is an abandoned/previously-revoked signup, not a real member. Today it is a permanent dead end for that email address.

Change the `invite` branch of `invite-user`:

- Existing user **has roles in the caller's org** → keep the current 409 "already a member".
- Existing user **has roles in another org** → keep the current 409 "registered with another account".
- Existing user **has no roles anywhere** → treat as re-invitable: create the `invitations` row (with `invited_user_id` set to the existing user), then send them a fresh invite-style email via `generateLink` type `recovery` (works for confirmed users, where `inviteUserByEmail` hard-fails), pointing at `<origin>/accept-invite`. The existing `accept_my_invitation` RPC then grants role and org on acceptance as usual.

Also replace the current `listUsers({ page: 1, perPage: 200 })` scan with a targeted lookup so the pre-check stays correct once the project has more than 200 users.

## Technical notes

- `src/pages/AdminInvitations.tsx` — `callInviteFn` error unwrapping only; no visual change.
- `supabase/functions/invite-user/index.ts` — refine existing-user branch, add recovery-link path for role-less accounts, replace paged user scan.
- No database migration and no schema change required.
- `/accept-invite` already handles setting a password for a user arriving from an emailed link, so no page changes are expected.
