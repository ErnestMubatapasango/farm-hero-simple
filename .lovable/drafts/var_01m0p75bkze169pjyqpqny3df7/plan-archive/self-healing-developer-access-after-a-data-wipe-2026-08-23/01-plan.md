# Self-healing developer access after a data wipe

## Where things stand today

Developer access is bootstrapped by `ensure_platform_developer()`, a database-only function with one hardcoded email (`enerst@digitalbots.agency`). It only works if a matching row still exists in `auth.users` — it looks the account up by email and returns nothing if that user is gone. The data-reset script (`docs/reset-data.sql`) calls it at the end, so a *deliberate* reset that keeps auth users is already covered.

The gap is the accidental case: if `user_roles` is wiped and nobody re-runs that function, or if the auth users themselves are deleted, there is no path back — no one on the platform holds the `developer` role, and nothing in the app can grant it.

## The fix: a persistent developer allowlist

Instead of relying on a one-off function call and a hardcoded string, keep the source of truth for "who is a platform developer" in its own table that survives application-data resets, and have signup and sign-in re-grant the role automatically from it.

1. A small `platform_developers` table holds allowlisted emails. No app role can read or write it — only the database owner / SQL editor.
2. The existing signup trigger checks that allowlist: if a new account's email is on it, the `developer` role is granted immediately, with no organization.
3. A tiny "heal on login" step re-grants the `developer` role if the allowlist says the signed-in user is one and the role row is missing.
4. `ensure_platform_developer()` is rewritten to loop over the allowlist rather than one hardcoded email, and the reset script keeps calling it.
  &nbsp;

Result: even after a complete wipe, an allowlisted person just signs up (or signs in) with their email and regains developer access without anyone touching SQL.
