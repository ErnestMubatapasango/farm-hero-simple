# PWA new-version notification for mobile users

## What changes

Add a user-facing update prompt so users of the mobile-installed PWA know when a new build is deployed and can reload to get it. The app currently uses `vite-plugin-pwa` with `registerType: 'autoUpdate'`, but the service worker updates silently and the old version can stay active on mobile until the app is killed.

### Recommended UX

- A non-blocking bottom banner (or Sonner toast) that appears when a new version is detected.
- It says: “A new version of KYF is available. Update now to get the latest fixes.”
- Actions: **Update now** (reloads the app) and **Later** (dismisses until the next update or session).
- Also a small version/build string on the Profile or AppSidebar footer so users and support can confirm which version is running.

## Implementation

1. **Expose the service worker registration**
   - Refactor `src/pwa/registerSW.ts` so `registerSW()` returns the active registration or exposes a callback for `updatefound`.
   - Keep the existing guard logic so it never registers in dev, preview, or iframes.

2. **Check for updates on app resume**
   - In `registerSW.ts`, after registration, attach a `visibilitychange` listener that calls `registration.update()` when the app returns to the foreground. Mobile browsers often only fetch SW updates on startup, so an explicit check on resume is important.

3. **Create a `usePWAUpdate` hook**
   - `src/hooks/usePWAUpdate.ts` listens for `registration.onupdatefound` and the installing worker’s `statechange` to `installed`/`waiting`.
   - Exposes `needUpdate: boolean` and `update: () => void`.
   - `update()` tells the waiting worker to skip waiting (or simply reloads the page, depending on Workbox config) and waits for `controllerchange` before reloading.

4. **Create an `UpdatePrompt` component**
   - `src/components/UpdatePrompt.tsx` renders a mobile-friendly bottom banner with Update/Later buttons.
   - Uses Sonner toast or a shadcn `Alert`/`Banner` component. Dismiss state is stored in a session-level key so the banner is not spammed.

5. **Mount the prompt globally**
   - Add `<UpdatePrompt />` in `src/App.tsx` alongside `<InstallPrompt />`, so it appears in all routes once the app is loaded.

6. **Make the Workbox config update-friendly**
   - In `vite.config.ts`, ensure `workbox.skipWaiting` is `true` so the new worker can take control after the user reloads.
   - Keep `registerType: 'autoUpdate'` and `injectRegister: null` unchanged.

7. **Show a version/build stamp**
   - Add a small version line on the Profile page or in the AppSidebar footer (e.g., “Version 2026.08.16.1234”). The value can be derived from the build timestamp or a `VITE_APP_VERSION` env variable.

8. **Verify**
   - Build a production bundle (`vite build && vite preview`) and confirm the banner appears after a second deploy.
   - Add a simple unit test for `usePWAUpdate` using a mock `ServiceWorkerRegistration`.

## Acceptance criteria

- After a deploy, a mobile PWA user who already has the app open or reopens it sees the update prompt.
- Tapping **Update now** reloads the app and the new version is active.
- The prompt never appears in dev, Lovable preview, or iframe previews.
- The current version/build is visible somewhere in the app for support/debugging.
