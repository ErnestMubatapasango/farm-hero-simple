
# Offline Support for Field Enumerators

Enumerators in rural areas need to onboard farmers without a network and have their work sync automatically once connectivity returns. This plan adds an offline-first path for the enumerator workflow only — admin dashboards, credit scoring, and user management stay online-only because they depend on server RPCs and multi-user state.

## Scope

In scope (works offline):
- Log in once online, then use the app while offline
- Create a new farmer (draft) from the Onboarding form
- Edit a farmer they previously onboarded
- Queue farmer document uploads
- View a local list of "My farmers" they onboarded or drafted on this device
- Automatic background sync when the network returns

Out of scope for this phase (stay online-only):
- Verifying / rejecting farmers, bulk actions, CSV export
- Credit score computation and admin analytics
- Invitations, user/role management
- Realtime notifications and activity feed
- Viewing farmers not enrolled by the current enumerator on this device

## User experience

1. First login must be online. After login, the app caches the shell and the enumerator's own farmer list.
2. A connection indicator in the top bar shows Online / Offline / Syncing with a pending-changes count.
3. When offline, the Onboarding form and Edit Farmer form still work. Submitting queues a change locally and shows a "Saved offline — will sync" toast. The farmer appears immediately in "My farmers" with a "Pending sync" badge.
4. Document uploads while offline are stored locally and queued; the checklist shows "Queued" until upload succeeds.
5. When the browser goes back online, a sync runs automatically. Successful items lose the pending badge; failed items surface in a "Sync issues" drawer with retry and per-item error messages.
6. If a farmer was already verified server-side and the enumerator queued an edit while offline, the edit is rejected on sync (matches existing state-machine rules) and shown in Sync issues with a clear reason.

## Technical design

### PWA shell
- Use `vite-plugin-pwa` with `generateSW`, `registerType: "autoUpdate"`, `injectRegister: null`.
- Single guarded registration wrapper that refuses to register in dev, iframes, Lovable preview hosts, and when `?sw=off` is present; unregisters `/sw.js` in those contexts.
- `NetworkFirst` for HTML navigations, `CacheFirst` for hashed built assets, exclude `/~oauth`.
- Manifest with app name, theme color matching the KYF green, icons under `public/`.
- Do not touch any Firebase/OneSignal workers (none exist today).

### Local storage layer
- Add IndexedDB via `idb` with these stores:
  - `outbox` — queued mutations `{ id, kind: 'save_farmer'|'upload_document', payload, createdAt, attempts, lastError, status }`
  - `farmers_local` — enumerator's farmers (server rows + local drafts), keyed by `id` (server uuid or a `local-<uuid>` placeholder)
  - `documents_local` — queued file blobs keyed by `{farmerId, docType}`
  - `meta` — last sync time, current user id, org id
- All writes go through a `farmerRepo` module so the UI never talks to Supabase directly for enumerator write paths. Online writes still hit Supabase immediately but also update the local store; offline writes only update local and enqueue.

### Sync engine
- A `syncManager` module started once inside `AuthProvider` after login.
- Triggers: `online` event, app focus, successful login, manual "Sync now" button, and a 60s heartbeat while the tab is open.
- Processes `outbox` FIFO. For `save_farmer` it calls the existing `save_farmer` RPC with the queued payload; on success it replaces the local `local-<uuid>` id with the server id and rewrites any dependent queued items (e.g. document uploads referencing the local id). For `upload_document` it uploads the blob to the `farmer-documents` bucket and inserts the `farmer_documents` row.
- Conflict handling: server is source of truth. If the RPC rejects (state machine, permissions, verified immutability), the item is marked `failed` with the server error and left in Sync issues; no silent overwrite.
- Backoff: exponential with jitter, capped; max attempts before requiring manual retry.

### Data access pattern
- New hook `useMyFarmers()` reads from `farmers_local` first, then reconciles from Supabase in the background when online.
- `FarmerForm` (create + edit modes) calls `farmerRepo.saveFarmer(...)` instead of `supabase.rpc('save_farmer', ...)` directly. The repo decides online vs. queued.
- Edit is only offered for farmers present in `farmers_local` (i.e. enrolled by this enumerator). Attempting to edit an unknown farmer while offline shows an explanatory empty state.

### Auth while offline
- Supabase tokens are already persisted in `localStorage`. We keep `autoRefreshToken: true`. If the access token is expired and refresh fails offline, the app stays in a read-only "offline" mode and re-authenticates automatically on reconnect. No sign-out on transient offline.

### No backend/schema changes
- Reuses existing `save_farmer` RPC, `farmer_documents` table and storage bucket, and the workflow state machine. No new tables, RLS, or edge functions.

## File-level changes

New:
- `src/lib/offline/db.ts` — IndexedDB schema and helpers (`idb`)
- `src/lib/offline/farmerRepo.ts` — read/write facade used by the UI
- `src/lib/offline/syncManager.ts` — outbox processor and triggers
- `src/lib/offline/types.ts`
- `src/hooks/useOnlineStatus.ts`
- `src/hooks/useSyncStatus.ts`
- `src/hooks/useMyFarmers.ts`
- `src/components/ConnectionStatus.tsx` — top-bar indicator + Sync now
- `src/components/SyncIssuesDrawer.tsx`
- `src/pwa/registerSW.ts` — guarded registration wrapper
- `public/manifest.webmanifest` + icons
- Unit tests: `src/lib/offline/farmerRepo.test.ts`, `syncManager.test.ts`

Edited:
- `vite.config.ts` — add `vite-plugin-pwa` with the constraints above
- `index.html` — manifest, theme-color, apple-touch-icon links
- `src/main.tsx` — call guarded `registerSW`
- `src/hooks/useAuth.tsx` — start `syncManager` after session is ready; keep the existing revocation subscription
- `src/components/onboarding/FarmerForm.tsx` — call `farmerRepo.saveFarmer` instead of the RPC directly; show offline toast wording
- `src/components/farmer/FarmerDocumentsSection.tsx` — route uploads through the repo/outbox
- `src/pages/Dashboard.tsx` — the "My farmers" quick action reads from `useMyFarmers`
- `src/components/AppLayout.tsx` — mount `<ConnectionStatus />` in the header

## Rollout

1. Ship PWA shell + manifest + guarded SW behind published builds only. Verify no SW registers in Lovable preview.
2. Land IndexedDB + repo + sync manager with feature flag `VITE_OFFLINE_ENABLED`, enabled by default in production.
3. Migrate `FarmerForm`, doc uploads, and enumerator dashboard to the repo.
4. Communicate to users: "Log in once with internet. After that, onboarding works offline and syncs automatically when you're back on a network."

## Known limitations to disclose

- Offline works only in the published app, never in the Lovable editor preview.
- iOS Safari caps IndexedDB storage and can evict data if the app is unused for weeks — recommend syncing at least weekly.
- Server-side validations (duplicate national ID, verified immutability, missing required documents) are only enforced at sync time; the UI shows them in the Sync issues drawer.
