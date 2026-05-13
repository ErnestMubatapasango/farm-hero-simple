
## Goal

Bring the admin farmer screens in line with the new onboarding flow. Today the list shows only a few fields (name, region, farming_type, phone, status), and the detail page is missing per-crop **farming methods**, **yield history**, the new **location fields** (ward/village), and still labels income as **KES** instead of **USD**.

## 1. AdminFarmers (list — `src/pages/AdminFarmers.tsx`)

Update the row to show what enumerators actually capture now:

- Avatar initials + **full name** (unchanged).
- Subline 1: `farm_name` · `farm_size_hectares` ha · `farming_type`
- Subline 2: location chain — `region` › `sub_county` › `ward` › `village` (skip blanks).
- Right-side meta: small chips for `primary_crops` (first 2 + "+N") and a livestock icon if any. Phone moved to a tooltip / hidden on small screens.
- Keep status icon + chevron.

Filters:
- Keep search (extend to also match `farm_name`, `village`, `ward`, any `primary_crops`).
- Keep status pill filter (`all / pending / verified / rejected`).
- Add a second pill row for **farming type** (`all / crop / livestock / mixed`) with counts.

Query: extend the `select` to include `farm_name, farm_size_hectares, sub_county, ward, village, primary_crops, primary_livestock`.

## 2. AdminFarmerDetail (`src/pages/AdminFarmerDetail.tsx`)

### Data fetching
Replace the single `farmers` query with three parallel queries (Promise.all):
1. `farmers` (existing).
2. `farmer_crops` where `farmer_id = :id` ordered by `position` — gives per-crop `farming_method`.
3. `crop_yield_history` where `farmer_id = :id` ordered by `crop, year`.

### Sections
- **Personal** — unchanged.
- **Location** — unchanged (already shows region/sub_county/ward/village).
- **Farm Information** — keep farm name, size, type. Replace the flat `Primary Crops` row with a **Crops** subsection: one card per `farmer_crops` row showing crop name as title and a small "Farming method: X" pill. Keep `Primary Livestock` as a chip list.
- **Yield History** (new section, only if rows exist) — one small table per crop:
  ```
  Cocoa
  ┌──────┬────────────┬──────────────┐
  │ Year │ Yield (kg) │ Revenue (USD)│
  ├──────┼────────────┼──────────────┤
  │ 2024 │ 1,180      │ $7,200       │
  │ 2025 │ 1,340      │ $8,750       │
  └──────┴────────────┴──────────────┘
  ```
- **Financial** — change income label/format from `KES …` to `USD …` (matches onboarding). Bank + mobile money unchanged.
- **Notes** — unchanged.

## Out of scope

- No DB schema changes (all needed columns/tables already exist with correct RLS).
- No edits to onboarding itself, no new edit-farmer flow.
- No changes to verification logic (verify/reject buttons stay as is).

## Files touched

- `src/pages/AdminFarmers.tsx` — extended query, richer row, second filter row.
- `src/pages/AdminFarmerDetail.tsx` — extra queries, Crops subsection, new Yield History section, USD label.
