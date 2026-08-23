## Technical details

Staged as an additive migration (applies when this draft is accepted):

- `public.platform_developers (email text primary key, note text, created_at timestamptz default now())`, seeded with the current hardcoded address. RLS enabled with no policies, and no grants to `anon` / `authenticated`, so it is reachable only by security-definer functions and the SQL editor.
- `public.handle_invited_user()` (the `on_auth_user_created` trigger): after the existing profile/invite handling, if `lower(NEW.email)` is in `platform_developers`, insert `user_roles (user_id, null, 'developer')` with `ON CONFLICT DO NOTHING`. This branch is independent of invitations and organization metadata.
- `public.heal_my_developer_role()` — security definer, `EXECUTE` to `authenticated`. Looks up the caller's own email via `auth.uid()`, and only if that email is allowlisted inserts the missing `developer` role row. It can never grant a role to a non-allowlisted caller, and it takes no arguments, so it cannot be pointed at another user.
- `public.ensure_platform_developer(_email text default null)` rewritten to iterate the allowlist when `_email` is null (keeping the single-email behaviour when passed). `docs/reset-data.sql` keeps its existing call and gains a note that `platform_developers` must never be included in a reset.

Frontend:

- In the auth provider's deferred identity resolution, when a signed-in user resolves with no roles at all, call `heal_my_developer_role()` once, then re-read roles. Non-developers get a no-op and the current behaviour is unchanged.

Documentation:

- `docs/reset-data.sql` header documents the recovery procedure: allowlisted emails regain developer access simply by signing in, and adding a new developer means one `insert into public.platform_developers` in the SQL editor.
