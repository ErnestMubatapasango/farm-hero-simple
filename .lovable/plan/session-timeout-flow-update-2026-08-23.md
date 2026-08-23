# Session Timeout Flow Update

Two distinct cases, handled differently.

## Case A — Session expired while the user was away (app closed / returned later)

- Land on the normal login page.
- No inactivity message.
- Signing in works as usual and lands on the dashboard.

## Case B — 30 minutes of inactivity while the app is open

- Auto sign-out as today.
- The page the user was on is stored before signing out.
- Redirect to login with the message: "You were signed out after 30 minutes of inactivity. Please sign in again."
- After a successful sign-in, return the user to that exact page.

## After any successful login

- The inactivity flag and stored route are cleared, so the message never reappears and later logins go to the default page.

## Technical notes

- `src/lib/idle.ts`: keep `markIdleLogout`/`consumeIdleLogout`, add `storeIdleRedirect(path)` / `consumeIdleRedirect()` backed by the same `sessionStorage` namespace, plus a `clearIdleState()` used on successful sign-in. Note: `sessionStorage` is per-tab, which is exactly what makes Case A silent — a fresh browser session has no flag.
- `src/hooks/useAuth.tsx`: in `expiredByInactivity`, stop calling `markIdleLogout()`. That path only runs on session restore (Case A), so it should sign out silently and clear the stored timestamp without setting any notice.
- `src/hooks/useIdleTimeout.ts`: in `forceSignOut`, keep `markIdleLogout()` and additionally store the current route (`window.location.pathname + search`), skipping public routes (`/login`, `/forgot-password`, `/reset-password`, `/accept-invite`).
- `src/pages/Login.tsx`:
  - On mount, consume the idle flag and the stored route into local state (message shown only when the flag was present).
  - In `handleSignIn`, navigate to the stored route when present, else `/`, then call `clearIdleState()`.
  - The `if (session) return <Navigate to="/" replace />` early return also needs to honour a stored route so an already-restored session isn't bounced to the dashboard.
- No database, RLS, or edge function changes. No other auth behaviour touched.
