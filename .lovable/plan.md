# Safe database reset + guaranteed developer account

Current live state: 0 organizations, 0 user_roles, 0 invitations, 0 farmers, 1 profile with no org and no roles. The `app_role` enum still exists (it is a type, not data), and both bootstrap paths — the `handle_invited_user` signup trigger and the `create_organization` RPC — are SECURITY DEFINER, so a first user can still create an org and become `super_admin` from an empty database. The two gaps to close are stale profile links after a wipe, and the fact that nobody holds `developer`.

## 1. Make org creation resilient to a stale profile link

`create_organization` currently refuses when `profiles.organization_id` is not null, without checking that the referenced organization still exists. After a data wipe that clears `organizations` but leaves `profiles`, those users are permanently locked out of creating a new org.

Change: treat a link to a non-existent organization as "no organization" — only block when the referenced org row actually exists. Same tolerance in the `handle_invited_user` trigger path.

## 2. Reset script that cannot lock anyone out

Add a documented, ordered, data-only reset that clears app data **and** the pointers into it:

```text
notifications, farmer_activity_log, farmer_documents,
crop_yield_history, farmer_crops, credit_scores,
farm_health_scores, farmers, invitations,
user_roles, organizations
then: profiles.organization_id = NULL
```

Stored as `docs/reset-data.sql` for reference and run through the data tool when you ask for a reset. Auth users and profiles are preserved so people can sign back in and re-create their organization. Storage objects under `farmer-documents` are noted as a separate manual step.

## 3. Guaranteed developer account

A `developer` row is what gives platform-wide, cross-org visibility, and a wipe removes it.

- New idempotent function `public.ensure_platform_developer()`: looks up the designated owner email in `auth.users` and inserts `user_roles(user_id, NULL, 'developer')` if missing. Safe to run repeatedly; no-op if the user does not exist yet.
- Called once at the end of the migration, and again as the final line of the reset script, so a developer always exists after a wipe.
- Designated owner: `enerst@digitalbots.agency` (the existing account). Tell me if it should be a different address.
- The function is `SECURITY DEFINER` with `EXECUTE` revoked from `anon` and `authenticated` — it is not callable from the browser, only from migrations and the SQL editor. No new privilege-escalation surface.

## 4. Surface the orphan state

The orphaned profile already routes to `/setup-organization` via the `RequireOrg` guard, so no new UI is needed. Small addition: on that screen, show a short line explaining the account has no organization yet and that creating one makes them its super admin.

## Technical notes

- One migration: patch `create_organization` and `handle_invited_user` for the stale-link case, add `ensure_platform_developer()`, revoke its execute from client roles, call it once.
- `user_roles.organization_id` is nullable, which suits a platform-wide `developer` row; the unique constraint is on `(user_id, organization_id, role)`, so the insert uses `ON CONFLICT DO NOTHING`.
- New file `docs/reset-data.sql`; no schema changes to any table.
- Copy-only change to `src/pages/SetupOrganization.tsx`.
