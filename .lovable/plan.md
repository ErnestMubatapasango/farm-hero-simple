## Goal
Restrict credit score access to admin, super_admin, and developer roles only. Enumerators must not see scores anywhere.

## Changes

### 1. Database (migration)
Tighten RLS on `credit_scores` — replace the org-wide SELECT/INSERT/UPDATE policies so enumerators are excluded:

- **SELECT**: `has_role(auth.uid(), 'admin', organization_id) OR has_role(auth.uid(), 'super_admin', organization_id) OR has_role(auth.uid(), 'developer')`
- **INSERT / UPDATE**: same predicate (only admins+ can compute/recompute)
- **DELETE**: unchanged (super_admin/developer)

### 2. Frontend route guard
- `/credit-score` and `/credit-score/:farmerId`: redirect enumerators away (e.g. to `/dashboard`) with a toast. Use existing role check pattern from `AdminFarmers`/`AdminFarmerDetail`.

### 3. Navigation
- Hide the "Credit Score" nav item from enumerators in the sidebar/nav component.

### 4. Farmer detail page
- Hide any credit score widget/link on `AdminFarmerDetail` (and any farmer detail surface) when the viewer is an enumerator.

## Out of scope
- No changes to scoring algorithm or `credit-score-service.ts` logic.
- No changes to `farmer_documents` access (enumerators keep upload access per existing RLS).
- No UI redesign.

## Files touched
- New migration replacing 3 policies on `credit_scores`.
- Sidebar/nav component (hide link).
- `CreditScore.tsx`, `CreditScoreDetail.tsx` (route guard).
- `AdminFarmerDetail.tsx` (hide score section for enumerators).
