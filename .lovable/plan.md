
# Plan — Farmers list scale-ups + Required documents checklist

Two focused slices, no schema changes.

## Slice A — `AdminFarmers` page improvements

### A1. Server-side pagination
- Fetch a page at a time using `.range(from, to)` with `count: "exact"`.
- Page size selector: 25 / 50 / 100 (default 25).
- Footer shows `Showing X–Y of N` plus Prev / Next buttons.
- URL params: `page`, `pageSize` (added alongside existing `status`).

### A2. Server-side search
- Replace the in-memory `useMemo` filter with a debounced (300 ms) Supabase query.
- Searches `first_name`, `last_name`, `phone`, `farm_name`, `ward`, `village` via `.or(...ilike.%q%...)`.
- Reset to page 1 when search or status changes.
- URL param: `q`.

### A3. Sorting
- Sort dropdown above the list: Newest, Oldest, Name A→Z, Name Z→A, Status.
- Applied via `.order(...)` in the query.
- URL param: `sort`.

### A4. CSV export
- "Export CSV" button. Pulls all rows matching current filters (paged in 1000-row batches to respect Supabase's cap), builds a CSV in-memory, and triggers download.
- Columns: name, phone, region, district, ward, village, farm_name, farm_size_hectares, primary_crops, status, created_at.

### A5. Bulk verify / reject (admins only, `submitted` rows only)
- Checkbox column appears only for admins.
- "Select all on page" checkbox in the header.
- Floating action bar when ≥1 row selected: `Verify selected` / `Reject selected (with reason)`.
- Reject opens a small dialog that captures a single reason applied to all selected rows.
- Updates run as a single `.update(...).in("id", ids)` query; RLS still enforces per-row permission.
- Activity log entries are created automatically by the existing `farmers_audit_trigger`.
- Toast with success/failure count, then reload the page.

### Files touched
- `src/pages/AdminFarmers.tsx` (main rewrite — keep the existing visual design, just swap the data-fetching layer and add controls).
- New: `src/lib/csv.ts` — tiny CSV stringifier (no dependency).

## Slice B — Required documents checklist

### B1. New component
- `src/components/farmer/RequiredDocumentsChecklist.tsx`
- Required types (constant): `id` (National ID), `land_title` (Land Title). Optional: `receipt`, `insurance`, `photo`, `other` (shown grouped under "Optional").
- For each required type, show:
  - Checkmark + green if a `verified` doc of that type exists
  - Clock + yellow if a `pending` doc exists
  - X + red if a `rejected` doc exists (and no pending/verified replacement)
  - Outline + muted "Missing" if no doc of that type exists
- Show count complete (e.g. "2 of 2 required documents verified").

### B2. Wire into farmer detail
- Render the checklist at the top of `FarmerDocumentsSection` (above the upload form).
- Reuses the same `docs` array already loaded — no extra query.

### B3. Gate "Submit for Review"
- In `AdminFarmerDetail`, compute `hasRequiredDocs` from a fresh fetch of `farmer_documents` (types `id` and `land_title` with status ≠ `rejected`).
- If `canSubmit` but `!hasRequiredDocs`, disable the Submit button and show a small inline hint: "Upload National ID and Land Title before submitting."
- Admins (verify/reject) and the rest of the workflow are not affected.

### Files touched
- New: `src/components/farmer/RequiredDocumentsChecklist.tsx`
- `src/components/farmer/FarmerDocumentsSection.tsx` (mount the checklist)
- `src/pages/AdminFarmerDetail.tsx` (load required-doc status + gate Submit button)

## Out of scope for this round
- No DB migrations.
- No changes to the documents preview dialog, bulk download, or replace-file flow.
- No changes to the users/invitations/dashboard pages.
- Visual design stays as-is; only adds controls (sort dropdown, checkboxes, footer, action bar, checklist card).

## Acceptance check
- Lists with 1000+ farmers paginate without loading everything client-side.
- Searching for "smith" finds Smith on any page, not just the current one.
- An admin can select 10 submitted farmers and verify them in one click; activity log shows 10 verified entries.
- An enumerator viewing a draft farmer without a National ID sees the Submit button disabled with a clear reason.
