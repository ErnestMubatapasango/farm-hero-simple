## Where we already are

Good news: most of what you described is already built. The current model already enforces:

- `farmers.enrolled_by` records the enumerator who onboarded a farmer (your `created_by`).
- Status workflow `draft → submitted → verified / rejected`, with `rejected` returning the record to the enumerator for fixes and resubmit.
- Editing is gated by a `can_edit_farmer()` security-definer function:
  - developer / admin / super_admin: can edit any farmer in their org.
  - enumerator: can edit **only** farmers where `enrolled_by = auth.uid()` **and** `status IN ('draft','rejected')`.
  - Verified farmers are locked for enumerators — exactly your "immutable verified" rule.
- Edit history is in place: `updated_by`, `updated_at`, and a full `farmer_activity_log` audit table populated by a trigger on every create / update / status change (with rejection notes captured).
- Enumerators get notified automatically when a farmer is verified or rejected.
- Enumerators **cannot delete** farmers (delete is restricted to super_admin / developer).
- The `EditFarmer` page already shows a "record is locked" screen when the rules above say no.

## The real gap

One thing in your model is **not** enforced yet: **scope of visibility**. Today, any org member (including enumerators) can read every farmer in their organization via RLS. The admin farmers list already hides other enumerators' rows in the UI, but the database still returns them — a determined enumerator hitting the API directly would see everyone's data.

Your model says enumerators should only see the farmers they onboarded. So we need to fix that at the database layer, not just in the UI.

There are also two smaller UI-side gaps that follow from the same rule:

- The **Dashboard stats** (Total / Pending Review / Verified / Rejected) currently count org-wide for enumerators. They should count only their own farmers.
- The **AdminFarmers** page does client-side filtering for enumerators; once RLS is tightened we can drop that filter (RLS will do it for us) and rename the page entry for enumerators to "My Farmers".

## Plan

### 1. Database — tighten SELECT policies for enumerators

Replace the current "any org member can view" SELECT policies on the four farmer-data tables with policies that scope enumerators to their own records:

- `farmers`: enumerator can SELECT only rows where `enrolled_by = auth.uid()`. Admin / super_admin (in org) and developer keep full org visibility.
- `farmer_crops`, `crop_yield_history`, `farmer_documents`: same rule, evaluated against the parent farmer's `enrolled_by` (via an EXISTS subquery on `farmers`, or by piggybacking on the existing `can_edit_farmer`-style helper). Admin / super_admin / developer keep full org visibility.
- `farmer_activity_log`: enumerator can read only rows tied to farmers they enrolled. Admins keep org-wide visibility — this preserves auditability for lender / government reviews.

We will use a new `STABLE SECURITY DEFINER` helper (e.g. `can_view_farmer(_farmer_id uuid)`) so the policy logic is centralized and avoids recursion.

The existing INSERT / UPDATE / DELETE policies don't change — they're already correct.

### 2. Frontend — make Dashboard and farmers list reflect the new scope

- `src/pages/Dashboard.tsx`: when the user is an enumerator (and not also admin/super_admin/developer), add `.eq("enrolled_by", session.user.id)` to the farmers stats query. Counts then show "my farmers" totals for enumerators, org-wide totals for admins.
- `src/pages/AdminFarmers.tsx`: drop the client-side `enrolled_by` filter (RLS will handle it) and switch the page heading to "My Farmers" when the viewer is enumerator-only. Keep the "edit / view" buttons exactly as they are — `can_edit_farmer` already controls editability.
- `src/components/AppSidebar.tsx`: rename the "Farmers" admin-nav entry to "My Farmers" for enumerator-only viewers (admins keep "Farmers"). The Onboarding link stays as it is.

### 3. What we are intentionally **not** changing

- We are not adding a separate `under_review` status. `submitted` already means "awaiting admin review" and the admin verify/reject flow already operates on it. Splitting it adds workflow surface without buying us anything yet.
- We are not changing delete rules. Enumerators already cannot delete; super_admin delete stays as the org's safety valve.
- No change to the credit-score restrictions from earlier turns.

## Technical details

Tables / RLS touched:

- `public.farmers` — replace SELECT policy.
- `public.farmer_crops` — replace SELECT policy.
- `public.crop_yield_history` — replace SELECT policy.
- `public.farmer_documents` — replace SELECT policy.
- `public.farmer_activity_log` — replace SELECT policy.
- New helper: `public.can_view_farmer(_farmer_id uuid)` returning `boolean`, `STABLE SECURITY DEFINER`, encoding "developer OR admin/super_admin in farmer's org OR (enumerator in farmer's org AND farmer.enrolled_by = auth.uid())".

Files touched:

- `supabase/migrations/<new>.sql` — helper function + 5 policy swaps.
- `src/pages/Dashboard.tsx` — scope the farmers stats query for enumerator-only viewers.
- `src/pages/AdminFarmers.tsx` — drop client-side filter; conditional page title.
- `src/components/AppSidebar.tsx` — conditional label for enumerators.

## Out of scope

- No new tables.
- No changes to the credit-score access work from prior turns.
- No new statuses, no new audit fields (we already have `updated_by`, `updated_at`, `farmer_activity_log`).
- No edge-function changes.
