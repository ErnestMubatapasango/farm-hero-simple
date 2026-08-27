# Fix: invite acceptance fails when the new password matches the old one

## What the console is actually showing

Two separate things:

1. `[Violation] Permissions policy violation: unload is not allowed` from `inspector...js` — this comes from the Lovable preview inspector, not the app. Nothing to fix.
2. `POST /auth/v1/user → 422` — this is the real failure. The auth logs for 08:16 UTC confirm it: `422: New password should be different from the old password` (`error_code: same_password`), on a request referred from the site root, for `info@digitalbots.agency` who had just signed in through `/accept-invite` via a recovery link.

So: the invitee reached the account-activation screen and typed a password that is identical to the one already on the account. Supabase rejects it, and the raw message is dumped into the form — the user has no idea what to do, and the invitation never gets marked accepted because `accept_my_invitation` is only called after the password update succeeds.

## What to change

Only error handling and the acceptance flow — no database, RLS, or edge function changes.

### 1. Accept-invite: treat "same password" as success, not failure

On `/accept-invite`, the point of the password step is to make sure the account has a password the user knows. If Supabase says the password is unchanged, the user already knows it — that is not an error state. So when `updateUser` returns the `same_password` error, skip the password error and continue with the rest of the activation: still save the full name, still call `accept_my_invitation`, still refresh roles, still land the user on the dashboard.

For any other update error, keep showing the message as today, but with friendlier wording for the common cases (password too short / weak).

### 2. Reset password: show a human message instead of the raw one

On `/reset-password` the same 422 can happen, and there "reuse the old password" genuinely is a no-op. Show: "That's the same as your current password. Enter a different one." and leave the user on the form.

## Technical notes

- `src/pages/AcceptInvite.tsx`: in `handleSubmit`, inspect the error from `supabase.auth.updateUser` — Supabase returns `code`/`error_code` `same_password` with status 422. On that code, fall through instead of returning early; when the name is the only thing left to persist, call `updateUser({ data: { full_name } })` on its own so the metadata still lands. All other errors keep the current early-return behaviour with a mapped message.
- `src/pages/ResetPassword.tsx`: map the `same_password` / 422 case to the friendly copy above; other errors unchanged.
- No change to `accept_my_invitation`, the `invite-user` edge function, or the invitations UI.
