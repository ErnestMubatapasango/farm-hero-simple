## Goal

Implement two MVP backend-backed features for KYF:
1. **Farmer documents** — uploads, viewing, and admin verification on the Farmer Detail page.
2. **Credit scoring** — persisted scores with org-wide list view + per-farmer drill-down.

---

## 1. Database (single migration)

### Storage bucket
- Create private bucket `farmer-documents` (not public; signed URLs for downloads).
- Files stored at `{organization_id}/{farmer_id}/{document_id}.{ext}`.
- RLS on `storage.objects`:
  - SELECT: org members of `organization_id` folder.
  - INSERT: any user with `can_edit_farmer(farmer_id)`.
  - DELETE: admins/super_admins of org OR the uploader (when farmer is draft/rejected).

### Table: `farmer_documents`
Fields (domain only): `farmer_id`, `organization_id`, `uploaded_by`, `document_type` (id, land_title, receipt, insurance, photo, other), `file_path`, `file_name`, `mime_type`, `file_size`, `status` (pending, verified, rejected), `verified_by`, `verified_at`, `notes`.
- RLS:
  - SELECT: org members.
  - INSERT: `can_edit_farmer(farmer_id)` AND `uploaded_by = auth.uid()`.
  - UPDATE (verify/reject): admin/super_admin/developer of org. Edit notes/replace file: uploader on draft/rejected farmers.
  - DELETE: admin/super_admin/developer OR uploader on draft/rejected farmer.

### Table: `credit_scores`
Fields (domain only): `farmer_id` (unique), `organization_id`, `score` (300–850), `band`, `breakdown` (jsonb — stored ScoreBreakdown[]), `recommendations` (jsonb), `computed_by`, `computed_at`, `inputs_hash` (text, to detect when recompute is needed).
- RLS:
  - SELECT: org members.
  - INSERT/UPDATE: `can_edit_farmer(farmer_id)` OR admin/super_admin/developer (anyone allowed to view a farmer can trigger recompute).
  - DELETE: super_admin/developer.
- Unique index on `farmer_id`.

---

## 2. Documents UI (Farmer Detail page only)

New `FarmerDocumentsSection` component, rendered inside `AdminFarmerDetail.tsx`:
- Lists all `farmer_documents` for the farmer, grouped by `document_type` with status badge.
- Per row: file name, uploader, uploaded date, status badge, download button (signed URL), and (admin-only) Verify / Reject buttons + notes prompt.
- Upload control:
  - Visible when `canEdit` (existing logic on detail page).
  - Document type selector (id, land_title, receipt, insurance, photo, other).
  - File input (accept images + pdf, client-side max 10 MB).
  - On upload: insert row, then upload to storage at computed path. Show toast on success/failure.
- Delete button on row when allowed.
- All file paths fetched as signed URLs (60s expiry) via `supabase.storage.from('farmer-documents').createSignedUrl`.

No new routes, no onboarding-step changes.

---

## 3. Credit Scoring

### Scoring engine reuse
`src/lib/credit-score.ts` already exists. Extend its `computeCreditScore` input shape to accept the real DB rows we have (farmer row, farmer_crops, crop_yield_history, farmer_documents — replacing the current `documents`/`financialRecord` mock placeholders). Map:
- `farmProfile` ← farmer row (farm_size_hectares, region, district, primary_crops, etc.).
- `financialRecord` ← farmer row (annual_income, has_bank_account; `loan_status` set to `none` for now since column not in schema).
- `documents` ← `farmer_documents` rows.
- `cropHistory` ← `crop_yield_history` rows.
- `profile` ← farmer row (full_name = first_name+last_name, phone).

Add a small wrapper `loadAndComputeScore(farmerId)` in `src/lib/credit-score-service.ts` that:
1. Fetches the 4 inputs in parallel.
2. Calls `computeCreditScore`.
3. Computes a stable `inputs_hash` (SHA over the inputs).
4. Upserts into `credit_scores` (only if `inputs_hash` changed or `force=true`).
5. Returns the `CreditScoreResult`.

### List view (refactor `src/pages/CreditScore.tsx`)
- For `enumerator`: list shows farmers they enrolled (RLS already org-scoped; client filter by `enrolled_by`).
- For `admin`/`super_admin`/`developer`: all org farmers.
- Columns: name, region, primary crop, score (band-colored), band, last computed.
- Search box (name) + status filter (verified-only toggle).
- "Recompute all" button (admin only) — runs `loadAndComputeScore` per farmer in batches of 5.
- Click row → `/credit-score/:farmerId`.

### Detail view: new route `src/pages/CreditScoreDetail.tsx` at `/credit-score/:farmerId`
- Big score gauge with band color.
- Breakdown table: each pillar with weight, score, weighted contribution, detail string.
- Recommendations list.
- "Recompute" button (re-runs `loadAndComputeScore(force=true)`).
- Link back to farmer detail.
- Last computed timestamp + computed_by.

Both pages use the persisted `credit_scores` row for instant render; recompute writes back.

---

## 4. Routing & navigation

- Add `/credit-score/:farmerId` route in `src/App.tsx` (inside `ProtectedRoute` + `AppLayout`, no `AdminRoute` wrapper — RLS handles enumerator scope).
- Existing sidebar link to `/credit-score` already present.

## 5. Out of scope

- No financial_records table (deferred to Phase 2 — credit engine handles missing data gracefully today).
- No OCR / extracted fields on documents.
- No cross-farmer documents page (`/documents` placeholder unchanged).
- No batch async recompute jobs (in-process loop is fine for MVP org sizes).
- No design changes — use existing `kyf-card` and tokens.

---

## Technical notes (for reference)

- Storage path strategy lets us scope RLS by folder. We use `(storage.foldername(name))[1] = organization_id::text`.
- `inputs_hash` lets the list view show "stale" indicator if the underlying farmer/crop/yield rows were updated after `computed_at`.
- All Supabase calls from client; auth context provides `organizationId` and `roles`.
- Files: 1 migration, 2 new components (`FarmerDocumentsSection`, `CreditScoreDetail`), 1 new lib (`credit-score-service.ts`), edits to `CreditScore.tsx`, `AdminFarmerDetail.tsx`, `App.tsx`, and `credit-score.ts`.
