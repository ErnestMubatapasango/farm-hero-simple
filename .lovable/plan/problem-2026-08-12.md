Replace the generic spinner and route-flash with a unified germination-themed loading screen.

## Problem

During reloads or navigations the app briefly flashes the Dashboard or Create Organization page before the real layout appears. The current fallback is a plain spinner in `ProtectedRoute.tsx` and `AdminRoute.tsx`, while `RequireOrg.tsx` returns `null` during loading. Because `useAuth` sets `loading = false` before the roles/org fetch completes, the route guards redirect/render real pages before the auth context is fully resolved, producing the flash.

## Goal

1. Show a single, branded loading screen that looks like the KYF logo is germinating.
2. Keep the loading state active until **session + roles + organization** are fully resolved.
3. Ensure every route guard (`ProtectedRoute`, `RequireOrg`, `AdminRoute`) uses the same loader.
4. Optionally reuse the loader for page-level skeletons.

## Proposed changes

### 1. Create a central `GerminatingLogo` loader

New file: `src/components/GerminatingLogo.tsx`

- Full-screen overlay with a soft earth-tone background (`bg-background`).
- Centered logo/seed icon that animates: a small seed pulses, then a sprout emerges and grows, then the KYF wordmark or `Sprout` icon fades in.
- Built with Tailwind CSS keyframe animations (`animate-pulse`, `animate-grow`, custom `@keyframes`) so it works offline and requires no extra library.
- Optional text label: "Growing your workspace..." or similar.

### 2. Fix the auth loading lifecycle

Edit: `src/hooks/useAuth.tsx`

- Keep `loading = true` until `getSession()` finishes **and** `fetchRolesAndOrg()` (or `finalizeSession()`) completes.
- In `onAuthStateChange`, only set `loading = false` after the same `finalizeSession()` resolves.
- Prevent the double-flash where `getSession` returns first but `onAuthStateChange` fires later with the same session.

### 3. Unify route guards

Edit:

- `src/components/ProtectedRoute.tsx` — replace the inline spinner with `<GerminatingLogo />`.
- `src/components/AdminRoute.tsx` — replace the inline spinner with `<GerminatingLogo />`.
- `src/components/RequireOrg.tsx` — return `<GerminatingLogo />` instead of `null` while `loading` is true.

This ensures the user never sees a blank page or an intermediate redirect target.

### 4. Update page-level loading states

Optional but recommended: replace the inline spinner fragments in `Dashboard.tsx`, `AdminFarmers.tsx`, `AdminUsers.tsx`, `AdminRoles.tsx`, `Documents.tsx`, `Analytics.tsx`, `CreditScore.tsx`, `CreditScoreDetail.tsx`, `AdminFarmerDetail.tsx`, `EditFarmer.tsx`, and `Profile.tsx` with either `<GerminatingLogo />` or the existing `Sprout` icon to keep the germination motif consistent.

Priority for this plan: only the route guards and the new loader are required. Page-level spinners can be updated opportunistically if they are simple drop-in replacements.

## Technical details

- The loader will be a presentational component, not tied to auth state, so it can be reused anywhere.
- Animations will use Tailwind arbitrary values and a small `<style>` block inside the component (or `index.css` if project convention prefers) for the custom grow keyframes.
- The `useAuth` change must be careful not to leave `loading = true` after a sign-out: `setLoading(false)` should still run when `session` becomes `null`.
- No database changes are needed.
- No new dependencies are needed.

## Files to edit

- `src/components/GerminatingLogo.tsx` (new)
- `src/hooks/useAuth.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/AdminRoute.tsx`
- `src/components/RequireOrg.tsx`
- `src/index.css` (optional, for custom keyframes if not inlined)
- `src/pages/Dashboard.tsx` (optional, loader drop-in)
- `src/pages/AdminFarmers.tsx` (optional)
- `src/pages/AdminUsers.tsx` (optional)
- `src/pages/AdminRoles.tsx` (optional)
- `src/pages/Documents.tsx` (optional)
- `src/pages/Analytics.tsx` (optional)
- `src/pages/CreditScore.tsx` (optional)
- `src/pages/CreditScoreDetail.tsx` (optional)
- `src/pages/AdminFarmerDetail.tsx` (optional)
- `src/pages/EditFarmer.tsx` (optional)
- `src/pages/Profile.tsx` (optional)

## Verification

1. Reload the app while signed in — only the germination loader appears before the dashboard.
2. Open `/admin/roles` directly in a new tab — only the loader appears before the roles page.
3. Sign out and reload `/login` — loader should not appear.
4. Simulate a slow network — verify that no dashboard or setup-organization page flashes.
5. TypeScript check passes with no new `any` types.
