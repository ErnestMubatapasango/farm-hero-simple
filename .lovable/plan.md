# Fix: invitations marked "accepted" before the invitee ever opens the email

## What's happening

Confirmed from the live database. The most recent invitation to `tawazzmubazz@gmail.com` (role: admin):

- created at `02:47:03.673`
- marked `accepted` at `02:47:03.814` — 140 milliseconds later
- the invited auth user has `email_confirmed_at = null`, `last_sign_in_at = null` (they have never opened the link or signed in)
- yet an `admin` role row already exists for them in the organization

Root cause: Supabase's `inviteUserByEmail` creates the auth user row **immediately** (unconfirmed) at the moment the invite email is dispatched. A trigger on new auth users (`handle_invited_user`) sees a matching pending invitation and does the full acceptance work right there — grants the role, links the profile, sets `status = 'accepted'` and `accepted_at`.

So acceptance is being driven by "invite was sent", not by "invitee set their password". The email is still sent correctly; the status is just wrong, and the role is granted too early.

## The fix

1. **Stop the signup trigger from accepting invitations.** When a new auth user matches a pending invitation, the trigger should only:
   - create the profile row and link it to the invitation's organization
   - record `invited_user_id` on the invitation
   - leave `status = 'pending'` and grant **no role**

   The organization self-signup branch (`pending_org_name` → create org + `super_admin`) stays exactly as it is.

2. **Acceptance happens only in `accept_my_invitation`.** This RPC already runs when the invitee submits their name and password on `/accept-invite`. It stays the single place that grants the invited role and flips the invitation to `accepted` with a real `accepted_at`.

3. **Clean up the premature grant.** Reset the affected invitation back to `pending` (clear `accepted_at`) and remove the `admin` role row that was granted to the user who never accepted, so they only get access after actually setting a password.

4. **Clearer status in the Invitations UI.** A pending row that already has an `invited_user_id` shows as "Invited — awaiting acceptance" so admins can tell "email sent" apart from "user is active". No change to the tabs or the revoke/resend/retry actions.

## Technical notes

- Migration rewrites `public.handle_invited_user()`: the invitation branch drops the `user_roles` insert and the `UPDATE invitations SET status='accepted'`, keeping the profile upsert plus an `invited_user_id` write.
- Same migration does the data repair for the one affected invitation and role row.
- `accept_my_invitation` needs no change — it already upserts the profile, inserts the role, and sets `status`/`accepted_at`/`invited_user_id`.
- Frontend change is limited to a status label in `src/pages/AdminInvitations.tsx`.
- Side effect worth noting: until an invitee accepts, they hold no role, so `RequireOrg`/route guards will treat a half-finished invite as "no access" rather than granting admin early — which is the intended behavior.
