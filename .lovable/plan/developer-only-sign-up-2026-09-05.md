# Developer-only sign-up

Today the login page offers exactly two doors: **Sign in** and **Create organization** (which signs the person up and creates an org). The only other way in is accepting an invite. So an allowlisted platform developer with no account has no way to create one without inventing an organization.

This plan adds a third, narrow door: **Developer access** — sign up with no organization, allowed only for emails on the developer allowlist. Everyone else stays invite-only.

## What changes for people using the app

- A third tab on the login page, "Developer access", with first name, last name, email and password.
- If the email is on the developer allowlist, the account is created immediately and signed in with developer access, without belonging to any organization.
- If the email is not on the allowlist, a clear message: this option is for platform developers; ask an organization admin for an invite.
- Nothing changes for normal sign-in, organization creation, or invites.

## Recovery story this closes

A developer who loses access can recreate their account from the login page, get developer access back automatically, and reset their password by email as usual.

## Technical notes

- New Edge Function `developer-signup` (public, no JWT): validates input, checks the requested email against `public.platform_developers` using the service role, and refuses anything not on the list with a generic message so the allowlist can't be probed for other addresses. On a match it creates the auth user with the email pre-confirmed, sets first/last name metadata, and calls `ensure_platform_developer` so the developer role and profile exist. Existing account -> returns a "sign in or reset your password instead" response rather than creating a duplicate. Basic per-email rate limiting on repeated attempts.
- `platform_developers` stays unreadable from the browser; no new client-side read of the allowlist.
- `Login.tsx`: add the third mode alongside `signin` and `create-org`, reusing the existing field layout and error handling. On success, sign in with the submitted credentials so the session is established through the normal auth flow.
- No schema migration required — the allowlist table, `ensure_platform_developer`, `heal_my_developer_role`, and the org-less developer bypass in `RequireOrg` already exist.
