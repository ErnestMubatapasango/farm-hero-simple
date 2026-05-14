## Goal
Remove all `farming_type` references from the codebase since the column was dropped. Farming method is now per-crop (already stored in `farmer_crops.farming_method`).

## Changes

### 1. `src/pages/Onboarding.tsx`
- Remove derived `farmingType` calculation (lines 150-153).
- Remove `farming_type: farmingType` from the `farmers` insert payload (line 174).

### 2. `src/pages/AdminFarmers.tsx`
- Remove `farming_type` from the `Farmer` interface and from the `.select(...)` string.
- Remove the type filter UI (`typeFilter`, `typeCounts`, the second filter row with crop/livestock/mixed buttons) — without `farming_type` we can't filter by it. (Alternative: derive type from `primary_crops`/`primary_livestock` lengths — confirm below.)
- Remove `f.farming_type` from `farmBits` in the row render.

### 3. `src/pages/AdminFarmerDetail.tsx`
- Remove `farming_type` from the `FarmerDetail` interface.
- Remove the "Type" `InfoRow` in the Farm Information card (line 285).

### 4. `src/components/onboarding/FarmStep.tsx`
- Unused legacy file (Onboarding.tsx renders inline farm fields, not this component). No `farming_type` reference — leave as-is unless cleanup desired.

### 5. Database
- No migration needed — user already dropped the column. Confirmed via schema: `farmers` table no longer lists `farming_type`.
- The `src/integrations/supabase/types.ts` will refresh from Supabase automatically; no manual edit.

## Open question
For `AdminFarmers.tsx` — the "All / Crop / Livestock / Mixed" tab filter:
- **Option A (simplest):** Remove the filter row entirely.
- **Option B:** Keep it, derive the type client-side: `mixed` if both crops and livestock exist, else `livestock` or `crop`.

Which do you want?
