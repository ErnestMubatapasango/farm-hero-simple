## Goal

Replace the current free-text "Primary Crops / Primary Livestock / Farming Type" UI in the Crops step of `src/pages/Onboarding.tsx` with the rich CropsStep experience: Primary + Secondary crop dropdowns, expandable per-crop card with farming-method picker, and a 2-year yield/revenue grid. Persist everything to the database.

## Database changes (one migration)

Two new tables, both org-scoped with RLS mirroring `farmers`.

### `farmer_crops`
Stores which crops a farmer grows + how each is farmed.
- `farmer_id` → references `farmers(id)` on delete cascade
- `organization_id` → for RLS scoping
- `crop` text (e.g. `maize`)
- `position` smallint (1 = primary, 2 = secondary)
- `farming_method` text (rain-fed, irrigation, conservation, commercial, subsistence, contract, organic)
- Unique `(farmer_id, position)` and `(farmer_id, crop)`

### `crop_yield_history`
Per-crop, per-year yield + revenue.
- `farmer_id` → references `farmers(id)` on delete cascade
- `organization_id` → for RLS scoping
- `crop` text
- `year` smallint
- `yield_kg` numeric
- `revenue_usd` numeric
- Unique `(farmer_id, crop, year)`

### RLS (same shape as `farmers`)
- SELECT: org members can view rows where `organization_id = get_user_org_id(auth.uid())` (or developer)
- INSERT: enumerator/admin/super_admin in matching org (or developer)
- UPDATE: admin/super_admin in matching org (or developer)
- DELETE: super_admin in matching org (or developer)

### Drop the now-redundant column
Keep `farmers.farming_type` (still used as overall classification: crop / livestock / mixed) and `farmers.primary_crops[]` (kept as a denormalized cache for fast lists), but the source of truth becomes `farmer_crops`. On insert we'll populate both.

## Frontend changes — `src/pages/Onboarding.tsx`

### State shape
Extend the wizard state with two new sub-objects so we can reuse CropsStep as-is:
```text
cropInfo: { primaryCrop: "", secondaryCrop: "", farmingMethods: {} }
yieldHistory: { "maize_2025": { yield: "", revenue: "" }, ... }
```

### Replace the Crops step JSX
Drop the current `Primary Crops / Primary Livestock / Farming Type` block in the `step === "crops"` branch and render `<CropsStep cropInfo={...} yieldHistory={...} setFormData={...} />` from `src/components/onboarding/CropsStep.tsx`.

Adapter: `setFormData` in CropsStep expects `prev => ({ ...prev, cropInfo, yieldHistory })`. Wrap our `setForm` in a small adapter so CropsStep can keep its existing signature without edits.

### Livestock
Move the Livestock + Farming Type inputs (kept as-is, comma-separated text + the crop/livestock/mixed selector) into a small block above CropsStep, since CropsStep is crop-only. No new table for livestock — keep `farmers.primary_livestock[]`.

### Submit (`handleSubmit`)
Convert from a single `farmers` insert to a 3-step write:
1. Insert into `farmers`, returning `id`. Keep `primary_crops` populated from `[primaryCrop, secondaryCrop]` for backwards compatibility.
2. Insert 1–2 rows into `farmer_crops` (one per selected crop) with `farming_method` from `cropInfo.farmingMethods[crop]` and `position` 1 or 2.
3. Insert up to 4 rows into `crop_yield_history` (2 crops × 2 years), skipping rows where both yield and revenue are empty.

If step 2 or 3 fails, surface the error and roll back via `supabase.from('farmers').delete().eq('id', newFarmerId)` so we don't leave an orphan farmer row.

### Validation
- Primary crop required to advance from Crops step
- Farming method required for every selected crop
- Yield/revenue optional (numeric only — already enforced in CropsStep)

## Files touched

| File | Change |
|------|--------|
| supabase migration | new — create 2 tables + RLS |
| `src/pages/Onboarding.tsx` | edit — new state shape, render CropsStep, rewrite handleSubmit |
| `src/components/onboarding/CropsStep.tsx` | unchanged |
| `src/components/onboarding/FarmingMethodCard.tsx` | unchanged (already used by CropsStep) |
| `src/integrations/supabase/types.ts` | regenerated automatically after migration |

## Out of scope

- Editing existing farmers' crops/yields (Phase 3 — admin farmer detail edit)
- Per-crop yield analytics on the dashboard
- Migrating existing `farmers.primary_crops[]` rows into `farmer_crops`
