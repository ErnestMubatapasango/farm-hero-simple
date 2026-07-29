## Goal

Give enumerators a natural path to upload documents right after saving a new farmer, surface every farmer's documents in the /documents page as an expandable list with a checklist, and turn /analytics into a real per-farmer (enumerator) / org-wide (admin+) view backed by a new Farm Health Index that complements the existing 300–850 credit score.

## 1. Post-save document upload in the create flow

- After a successful `save_farmer` in `FarmerForm.tsx` (create mode only), do not immediately navigate to `/dashboard`.
- Instead, transition the same page to a "Documents" post-save panel that renders the existing `FarmerDocumentsSection` for the newly created farmer, plus the `RequiredDocumentsChecklist` at the top.
- Two CTAs beneath it:
  - "Finish later" → `/dashboard`
  - "Submit for review" → calls the state-machine transition to `submitted` (only enabled once the checklist reports `hasAllRequiredDocs`).
- Offline: if the save was queued (local- id), show a friendly notice that documents will be attachable once the farmer syncs, and route to dashboard — the existing offline doc queue already handles the online case for existing farmers.
- Edit mode is unchanged (documents already live on the detail page).

## 2. /documents page — farmer-grouped, expandable

Replace the current placeholder `src/pages/Documents.tsx` with a real page:

- Data: one query for farmers the caller can see (reuse existing RLS-scoped `farmers` select, filtered by enumerator ownership for enumerators, org-wide for admins), plus a single `farmer_documents` select joined in memory.
- UI: search box + status filter + list of farmer rows. Each row is an `Accordion` item showing:
  - Left: farmer name, region/district, `RequiredDocumentsChecklist` compact summary ("2 of 2 verified" style badge).
  - Right: status chip counts (verified/pending/rejected/missing).
  - Expanded: the full `RequiredDocumentsChecklist` + the existing `FarmerDocumentsSection` in read/edit mode based on role.
- Pagination: server-side, same pattern as `AdminFarmers.tsx` (10 per page).
- Access: enumerators only see their own farmers (RLS already enforces this); admins/super_admins/developers see the whole org.

## 3. /analytics — role-scoped

Replace `src/pages/Analytics.tsx` placeholder:

- Enumerator view: list of their farmers, each expanding into a per-farmer analytics card (yield trend line, revenue by year, farm size context, Farm Health Index, credit score if computed).
- Admin/super_admin/developer view: an org-wide dashboard on top (total farmers by status, total hectares, aggregate yield by crop, avg Farm Health Index, top/bottom performers) + the same per-farmer drilldown below.
- Reuse `recharts` (already in the shadcn stack).
- Per-farmer card is also embedded on `AdminFarmerDetail.tsx` for continuity.

## 4. Farm Health Index (new) alongside credit score

New composite 0–100 score focused on operational health, not lending:

```text
FarmHealthIndex = round(
    0.30 * Productivity      // yield per hectare vs org p50 for the same crop
  + 0.25 * Consistency       // 100 - clamp(coefficient_of_variation_of_yields * 100)
  + 0.20 * Revenue           // revenue_per_hectare vs org p50
  + 0.15 * Scale             // log-scaled farm size, capped at 10 ha = 100
  + 0.10 * Compliance        // % of required docs verified
)
```

Bands: 0–39 At risk, 40–59 Developing, 60–79 Healthy, 80–100 Thriving.

Details:
- Computed by a new `public.compute_farm_health(_farmer_id uuid)` SECURITY DEFINER RPC that reads the same source tables as `compute_credit_score`, plus `farmer_documents` for compliance.
- Stored in a new `public.farm_health_scores` table (same shape as `credit_scores`: `farmer_id`, `organization_id`, `score`, `band`, `breakdown jsonb`, `computed_at`, `engine_version`).
- RLS: viewable by any org member who can view the farmer (enumerators included — this is operational, not credit). Insert/update only via the RPC.
- The existing `credit_scores` and `compute_credit_score` stay untouched; the analytics UI shows both side by side for admins, and only Farm Health for enumerators (credit score remains admin-gated as today).

## Technical notes

- Grants on `farm_health_scores`: `GRANT SELECT ON public.farm_health_scores TO authenticated; GRANT ALL TO service_role;` then RLS + policies mirroring `can_view_farmer`.
- Percentile inputs for Productivity/Revenue are computed inline in the RPC using `percentile_cont(0.5)` over the farmer's organization + crop.
- `FarmerDocumentsSection` already exposes `canEdit`/`isAdmin` — reuse it as-is in the new pages.
- No changes to the offline outbox schema; the post-save panel simply reuses the existing upload path for newly created online farmers.

## Files touched

- Update: `src/components/onboarding/FarmerForm.tsx`, `src/pages/Documents.tsx`, `src/pages/Analytics.tsx`, `src/pages/AdminFarmerDetail.tsx`
- New: `src/components/analytics/FarmerAnalyticsCard.tsx`, `src/components/analytics/OrgAnalyticsDashboard.tsx`, `src/lib/farm-health.ts` (client helper for fetching + formatting)
- Migration: create `farm_health_scores` table + `compute_farm_health` RPC + grants/RLS.

## Out of scope

- Bulk document verification queue (already exists on AdminFarmers).
- Historical trending of Farm Health Index over time — this iteration stores only the latest score.
