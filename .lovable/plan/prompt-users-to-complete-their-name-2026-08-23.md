# Prompt users to complete their name

Any signed-in user whose profile has no name is sent to a blocking "Complete your profile" screen until they enter a first and last name. This covers the platform developer account (`enerst@digitalbots.agency`), whose profile currently has no name at all.

## Behaviour

- After login, if the user's profile has no first/last name, the app redirects to `/complete-profile`.
- That screen asks for First name and Last name (both required), saves them, and returns the user to where they were headed.
- No sidebar, no dashboard access until saved — the only way out is saving or signing out.
- Users who already have a name never see it.

## Data changes

- Add `first_name` and `last_name` columns to `profiles`.
- Backfill both from the existing `full_name` where a name is already present (first token → first name, rest → last name).
- Keep `full_name` as the display field: a trigger keeps it in sync as `first_name || ' ' || last_name` whenever those change, so the sidebar, dashboard greeting and member lists keep working unchanged.

## Technical notes

- Migration: `ALTER TABLE public.profiles ADD COLUMN first_name text, ADD COLUMN last_name text`, a backfill `UPDATE`, and a `BEFORE INSERT OR UPDATE` trigger that composes `full_name`. Existing RLS on `profiles` already lets a user update their own row, so no policy changes.
- `useAuth`: extend the profile fetch to also select `first_name, last_name, full_name` and expose `needsProfileName` (true when both name columns are blank) plus refresh after saving.
- New route `/complete-profile` inside `ProtectedRoute` but outside `RequireOrg`/`AppLayout`, with a new `RequireProfileName` guard wrapping the existing app routes that redirects when `needsProfileName` is true. Loading state uses `GerminatingLogo`.
- New page `src/pages/CompleteProfile.tsx` styled like `SetupOrganization` (card, two inputs, submit button, inline error).
- `src/pages/Profile.tsx`: split its single name field into First/Last name to match the new columns.
