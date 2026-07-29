
## Current PWA state (already implemented)

The app is already configured as a fully functional PWA from the earlier offline work. Verified in the codebase:

- **Manifest** (`public/manifest.webmanifest`): name, short_name, `display: standalone`, theme + background colors, 192/512 maskable icons.
- **Head tags** (`index.html`): `<link rel="manifest">`, `theme-color`, `apple-touch-icon`.
- **Service worker** (`vite-plugin-pwa` in `vite.config.ts`): `generateSW`, `autoUpdate`, NetworkFirst for HTML navigations, CacheFirst for hashed assets/images, OAuth path excluded.
- **Guarded registration** (`src/pwa/registerSW.ts`): registers only in published production builds; skips dev, iframes, Lovable preview hosts, and honors `?sw=off`.
- **Offline mode**: IndexedDB outbox + sync manager (`src/lib/offline/*`) for enumerator farmer create/edit and document uploads. `ConnectionStatus` indicator in the header.
- **Responsive**: mobile sidebar auto-closes after navigation; layouts already responsive.

Result: on the published URL, Chrome/Android shows "Install app", and iOS Safari supports Add to Home Screen. Launched from the home screen it runs standalone, works offline for the enumerator flow, and syncs when back online.

## Proposed additions (small polish)

To make installability more discoverable — nothing structural changes:

1. **`src/components/InstallPrompt.tsx`** — lightweight banner/button:
   - Listens for `beforeinstallprompt`, stashes the event, shows a dismissible "Install KYF" button (Android/Chrome/Edge).
   - Detects iOS Safari (no `beforeinstallprompt`) and shows a one-time hint: "Tap Share then Add to Home Screen".
   - Hides itself when already running standalone (`display-mode: standalone` or `navigator.standalone`).
   - Persists dismissal in `localStorage` so it doesn't nag.

2. **Mount it once** in `src/App.tsx` (or the authenticated layout) so it appears app-wide but only when installable.

3. **README note** (optional): short paragraph in `.lovable/plan.md` documenting that PWA install + offline are live.

## Not changing

- No changes to the service worker, manifest fields (`start_url`, `id`, `scope`, `display`) — those are cached by installed apps and shouldn't be touched.
- No new caching strategies; current NetworkFirst/CacheFirst split is correct.
- No dev/preview registration — kept off intentionally (installability only works on the published URL).

## Technical notes

- Install prompt is Chromium-only; iOS never fires `beforeinstallprompt`, hence the manual hint.
- Testing: install works on `https://kyf2.lovable.app` (published) — not in the Lovable editor preview by design.
