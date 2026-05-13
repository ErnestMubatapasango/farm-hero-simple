## Goal

After an invitee accepts their invite, the Invitations page should reflect the new state automatically: status flips from "pending" → "accepted", and we surface the accepted user's **full name**, **email**, and **acceptance timestamp** so admins can see who is actively using the system.

Yes, the request makes sense and it's mostly a small extension of what already exists. The DB trigger `handle_invited_user()` already sets `invitations.status = 'accepted'`, `accepted_at = now()`, and `invited_user_id = NEW.id`. We just need to (a) join in the profile name and (b) render the new fields. Then we audit it with an FMEA.

---

## Proposed changes

1. **Data fetch (AdminInvitations.tsx)** — change the query from `select("*")` to also pull the joined profile name via the `invited_user_id` relationship:
   ```
   .select("id, email, role, status, created_at, accepted_at, invited_user_id, profiles:invited_user_id(full_name)")
   ```
   (Falls back to email if no profile row yet.)

2. **UI** — for accepted rows, render a second line with: `Accepted by {full_name || email} · {accepted_at}`. Keep the existing pending/expired display unchanged. Hide Resend for accepted rows (already conditional on `status === "pending"`, so just verify).

3. **Freshness** — add a lightweight refresh path so the list updates without a manual reload:
   - Option A (simple): refetch on tab focus + a "Refresh" button.
   - Option B (live): subscribe to Postgres changes on `invitations` filtered by `organization_id`.
   Recommend A for MVP, B as a follow-up.

4. **Type** — extend the local `Invitation` interface to include `invited_user_id` and `profiles: { full_name: string | null } | null`.

No DB migration is required — all needed columns and the trigger already exist.

---

## FMEA (Failure Mode and Effects Analysis)

| # | Failure mode | Cause | Effect | Sev | Likelihood | Mitigation |
|---|---|---|---|---|---|---|
| 1 | Status stays "pending" in UI after acceptance | List is only fetched on mount; no realtime/refetch | Admin thinks user hasn't joined; may resend unnecessarily | Med | High | Refetch on focus + Refresh button; later add realtime channel on `invitations` |
| 2 | `full_name` is null right after acceptance | User accepted invite link but hasn't submitted the AcceptInvite form yet (name only saved on `updateUser`) | UI shows email only, looks "incomplete" | Low | Med | Fall back to email; show "Name pending" hint; consider writing `full_name` from invite metadata in the trigger |
| 3 | Profile join returns null (RLS) | `profiles` SELECT policy only allows the user themselves or same-org admins/super_admins; works here but breaks if invited_user_id is in another org (developer view) | Developer sees blank names cross-org | Low | Low | Acceptable; developer role bypasses via existing policy `has_role(... 'developer')` |
| 4 | `invited_user_id` not set | Trigger fired but email casing mismatch / org mismatch left invitation row unchanged | Status remains "pending" forever even though auth user exists | High | Low | Trigger already does `lower(email)` match + org check; add a backfill admin action ("Mark accepted") and log when trigger updates 0 rows |
| 5 | Multiple invites for same email across orgs | User accepts org A's invite; org B's invite still pending and shouldn't flip | Wrong invite marked accepted | High | Low | Trigger already filters by `organization_id` — keep it that way; add unique partial index `(lower(email), organization_id) WHERE status='pending'` |
| 6 | Stale `accepted_at` after a resend | Resend resets `status='pending', accepted_at=null` but UI cache shows old timestamp | Confusing audit trail | Low | Low | Refetch after resend (already done); store a `resent_at` column if true history is needed |
| 7 | PII exposure (email/name) to lower-privileged users | `invitations` SELECT policy allows admin + super_admin + developer — admin can see all org invites incl. accepted user names | Possibly fine, but admins seeing super_admin invites' names could be sensitive | Low | Med | Confirm with product; optionally restrict accepted-user details to super_admin |
| 8 | Joined select breaks if FK relationship not declared in PostgREST | `profiles:invited_user_id(full_name)` requires a declared FK from `invitations.invited_user_id` → `profiles.user_id` (or `auth.users`); none exists today | Query returns 400 "could not find relationship" | High | High | Either (a) add FK `invitations.invited_user_id REFERENCES profiles(user_id)` (needs `profiles.user_id` UNIQUE), or (b) skip the join and fetch profiles in a second query keyed by `invited_user_id` |
| 9 | Race: trigger runs before profile insert | `handle_new_user` and `handle_invited_user` both fire on `auth.users` insert; ordering matters for the join | First fetch shows null name | Low | Med | Fallback to email; refetch later resolves it |
| 10 | Realtime channel leak | If we add subscription, forgetting to unsubscribe on unmount | Memory leak, duplicate fetches | Low | Med | Use cleanup in `useEffect` return |

**Highest-risk item is #8** — the embedded select syntax depends on a FK that doesn't exist in this schema. The safe path is to do **two queries**: fetch invitations, then fetch `profiles` for the set of `invited_user_id`s and merge client-side. This avoids a schema migration and keeps RLS straightforward.

---

## Recommended implementation (after your approval)

1. AdminInvitations.tsx
   - Extend `Invitation` interface with `invited_user_id` and `accepted_at` (already there).
   - After loading invitations, collect non-null `invited_user_id`s and run a second `profiles` query: `select("user_id, full_name").in("user_id", ids)`. Build a `Map<user_id, full_name>`.
   - For accepted rows, render: `Accepted by {nameMap.get(inv.invited_user_id) ?? inv.email} · {format(inv.accepted_at)}`.
   - Add a "Refresh" icon button next to "Invite User" and a `visibilitychange` listener that refetches when the tab becomes visible.
2. No migration, no edge function change, no new secret.

Optional follow-ups (not in this change):
- Realtime subscription on `invitations` for instant updates.
- `resent_at` column for full audit history.
- Admin-only "Force mark accepted" button to handle FMEA case #4.

Approve this and I'll implement steps 1–2.