# 30-Minute Inactivity Session Timeout

Sign users out automatically after 30 minutes with no activity, with a short warning before it happens.

## Behaviour

- Any of these count as activity: mouse move/click, key press, touch, scroll, or the tab becoming visible again.
- After 28 minutes of no activity, a dialog appears: "You will be signed out in 2 minutes" with a "Stay signed in" button and a live countdown.
- At 30 minutes of no activity the user is signed out and sent to `/login` with a message: "Signed out due to inactivity."
- The idle clock is shared across browser tabs (activity in one tab keeps all tabs alive) so a user working in a second tab is never logged out.
- Closing the browser and returning after more than 30 minutes also lands on the login page — the stored last-activity timestamp is checked on app start.
- The timer only runs while signed in; public pages (login, forgot/reset password, accept invite) are unaffected.

## What gets built

1. `src/hooks/useIdleTimeout.ts` — tracks last activity in a `localStorage` key (shared across tabs), throttles activity writes to about once every 15 seconds, and exposes `secondsUntilLogout` plus a `keepAlive()` action. Uses a single interval tick rather than one timer per event.
2. `src/components/IdleTimeoutDialog.tsx` — shadcn `AlertDialog` warning with countdown and "Stay signed in"; rendered once inside the authenticated area.
3. `src/hooks/useAuth.tsx` — on session restore, compare the stored last-activity timestamp against the 30-minute window and sign out immediately if it has already elapsed; clear the timestamp on sign-out.
4. `src/components/ProtectedRoute.tsx` (or `AppLayout`) — mount the idle hook + dialog so it only runs for signed-in users.
5. `src/pages/Login.tsx` — show the "Signed out due to inactivity" notice when redirected with that reason.

## Technical notes

- Timeout constants live in one module: `IDLE_TIMEOUT_MS = 30 * 60 * 1000`, `WARNING_MS = 2 * 60 * 1000`.
- Supabase's own JWT refresh keeps tokens valid indefinitely while the tab is open, so the idle limit is enforced client-side; `supabase.auth.signOut()` revokes the session server-side when it fires.
- Session storage key is namespaced per user id to avoid one user's timestamp affecting the next.
- No database or edge function changes needed.
