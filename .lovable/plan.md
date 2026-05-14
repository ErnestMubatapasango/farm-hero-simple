## Goal

Give enumerators a fast path to find farmers they onboarded and edit them via the same multi-step form they used at onboarding.

## 1. Dashboard quick action (`src/pages/Dashboard.tsx`)

- Add a new `QuickAction` card visible to enumerators: **"My Farmers"** → links to `/admin/farmers`, description "View & edit farmers you onboarded".
- Show this card for `enumerator` role (admins already see "Review Farmers", so we can show this only when the user is an enumerator without admin powers — same gating used in `AdminFarmers`).

## 2. Edit button on each farmer row (`src/pages/AdminFarmers.tsx`)

- For each row where the current user can edit the farmer (status is `draft` or `rejected` AND `enrolled_by === user.id`, OR user is admin/super_admin/developer), render a small pencil (`Pencil` from lucide-react) button next to the chevron.
- Clicking the pencil navigates to `/admin/farmer/:id/edit` (use `e.preventDefault()` + `e.stopPropagation()` so the row link doesn't also fire).
- Verified/submitted records owned by an enumerator who isn't admin → no pencil shown (edit is locked by RLS anyway, surface that in UI).

## 3. Reusable onboarding form + edit route

The current `src/pages/Onboarding.tsx` mixes UI and "create" logic. Refactor lightly so the same UI handles edit:

- **Extract** the form body + `FormState`/`emptyForm` into `src/components/onboarding/FarmerForm.tsx`. Props:
  - `mode: "create" | "edit"`
  - `initialData?: FormState`
  - `farmerId?: string` (only in edit)
  - Internal submit handler branches on `mode`.
- **`Onboarding.tsx`** becomes a thin wrapper: `<FarmerForm mode="create" />`.
- **New route** `src/pages/EditFarmer.tsx` mounted at `/admin/farmer/:id/edit` (wire it in `src/App.tsx` next to the existing `/admin/farmer/:id` route, gated by the same `ProtectedRoute`):
  1. On mount, load:
     - `farmers` row by id
     - `farmer_crops` (ordered by `position`)
     - `crop_yield_history` (current + previous year)
  2. Map into `FormState` (primary/secondary crop from positions 1/2, `farmingMethods[crop]` from `farming_method`, `yieldHistory[crop_year]` from yield rows).
  3. If user can't edit (status not in `draft`/`rejected` and not admin) → show a read-only banner + link back to detail page. Don't even render the form.
  4. Render `<FarmerForm mode="edit" farmerId={id} initialData={mapped} />`.

## 4. Submit logic in edit mode

Inside `FarmerForm.handleSubmit` when `mode === "edit"`:

- `UPDATE farmers` SET all editable columns by `id = farmerId`. Do **not** touch `status`, `enrolled_by`, `organization_id`, `verified_*`, `submitted_at` — the audit trigger handles `updated_by`/`updated_at` and the activity log.
- For crops: simplest correct approach — `DELETE FROM farmer_crops WHERE farmer_id = :id`, then `INSERT` the current selection (positions 1/2). RLS allows this because `can_edit_farmer()` is true for owners on draft/rejected and admins always.
- For yield history: same pattern — `DELETE FROM crop_yield_history WHERE farmer_id = :id`, then re-insert the non-empty rows from the form.
- Toast "Farmer updated" and navigate back to `/admin/farmer/:id`.

If anything fails after the farmers UPDATE we surface a toast — we do not attempt to roll back the farmer row (unlike create, which deletes the orphan farmer on failure) because the row already existed.

## 5. Out of scope

- No DB migration (RLS + triggers from the previous migration already cover this; `crop_yield_history` DELETE policy currently only allows super_admin — see note below).
- No design changes beyond the new card and pencil icon.

## Open question / heads-up

The current `crop_yield_history` DELETE RLS policy only allows `super_admin` / `developer`. If we go with the delete-then-insert approach for yields, an enumerator editing their own draft farmer will hit a permission error on yields. Two options:

1. **Recommended**: extend the DELETE policy to `can_edit_farmer(farmer_id)` (tiny migration).
2. Alternative: do per-row upsert (`INSERT ... ON CONFLICT (farmer_id, crop, year) DO UPDATE`) and skip deletes — requires adding a unique constraint on `(farmer_id, crop, year)` (also a migration).

I'll go with option 1 unless you prefer option 2.

## Files touched

- `src/pages/Dashboard.tsx` — add quick action
- `src/pages/AdminFarmers.tsx` — pencil button on rows
- `src/components/onboarding/FarmerForm.tsx` — new (extracted from Onboarding)
- `src/pages/Onboarding.tsx` — thin wrapper
- `src/pages/EditFarmer.tsx` — new
- `src/App.tsx` — register `/admin/farmer/:id/edit`
- `supabase/migrations/...` — extend `crop_yield_history` DELETE policy (option 1)
