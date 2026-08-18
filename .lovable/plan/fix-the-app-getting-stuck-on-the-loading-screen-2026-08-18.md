# Fix the app getting stuck on the loading screen

## What I checked

- Signed out, the app works: `/` redirects to `/login` and the login screen renders (verified in a test browser).
- The database has data (5 profiles, 7 role rows, 3 organizations, 2 farmers), so this is not an empty-database problem.
- The preview project uses an external Supabase project, so I could not sign in as a real user in my test browser. The diagnosis below is based on reading the auth code, and the first step of the fix is to confirm it with logging.

## Most likely cause (to confirm first)

Every screen behind the login sits behind `ProtectedRoute` / `RequireOrg`, which show the germinating loader while `useAuth().loading` is `true`. `loading` only becomes `false` at the end of an async chain, and today that chain runs *inside* the Supabase `onAuthStateChange` callback:

- On every auth event (initial session, token refresh, tab focus) the code sets `loading = true` and then awaits several Supabase queries (roles, profile, revoked-invite check, pending-org completion) from inside the auth callback.
- Supabase explicitly warns against awaiting client calls inside that callback: the client holds an internal auth lock while the callback runs, so those queries can wait on a lock that only releases after the callback returns. Result: the awaits never settle, `loading` stays `true`, and the UI shows the loader forever with no data.
- There is also no error path: if `getSession()` or any of those queries rejects (offline, expired refresh token, RLS error), nothing sets `loading = false`, so the loader is permanent.

This matches the symptom exactly: it happens for signed-in users, on reload/refocus, and shows a loader rather than an error.

## The fix

1. **Never await Supabase calls inside the auth callback.** Keep `onAuthStateChange` synchronous: store the session, then schedule the role/org resolution outside the callback (deferred), so the auth lock is released first.
2. **Separate "session known" from "profile loaded".** `loading` flips to `false` as soon as the session is known. Roles/org resolution gets its own state so route guards can render (or show a lighter state) instead of blocking the whole app.
3. **Guarantee the loader always ends.** Wrap session restore and every resolution step in `try/finally` so `loading` is always cleared, and add a hard safety timeout (a few seconds) after which the app renders with whatever it has instead of looping.
4. **Don't re-block the UI on background auth events.** Token refresh and tab-focus events should refresh roles quietly without setting `loading = true` again.
5. **Surface failures instead of hiding them.** If roles/org cannot be loaded, show a short error state with a Retry action rather than an endless loader, and log the underlying Supabase error.
6. **Move the pending-organization fallback out of the boot path** so a slow or failing org-completion call can never hold up first render.
7. **Same treatment for permissions.** `PermissionsProvider` sets its own `loading = true` on each identity/roles change; make sure a failed `my_permissions` call resolves and does not contribute to a stuck screen.

## Verification

- Confirm the diagnosis with temporary boot-stage logging (session received, roles resolved, loading cleared) and check the browser console on a signed-in reload.
- Reload a signed-in session repeatedly, switch tabs to trigger a token refresh, and confirm the dashboard renders each time.
- Simulate a failed roles query and confirm an error + Retry appears instead of an endless loader.

## Note on the console messages you pasted earlier

The `postMessage` origin warning, `unload` permissions-policy violation, `runtime.lastError` messages, and the "Function components cannot be given refs" warning all come from the Lovable preview inspector and browser extensions, not from your app. They are unrelated to this loading bug and need no code change.
