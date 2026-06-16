## Problem

On the dashboard, the "Pending Review" card filters farmers by `status === "pending"`, but that status doesn't exist in the schema. Valid farmer statuses are `draft`, `submitted`, `verified`, `rejected`. As a result the card always shows `0` for everyone — including enumerators, who should see how many of the farmers they've enrolled are awaiting admin review.

## Fix

In `src/pages/Dashboard.tsx`, change the `pendingFarmers` calculation to count farmers with `status === "submitted"` (i.e. submitted for review, not yet verified or rejected).

That single change makes the card meaningful for both audiences:
- **Enumerator**: number of their enrolled farmers waiting on admin review.
- **Admin / super_admin / developer**: number of farmers in their org awaiting review action.

The existing org-scoping logic (enumerators only see their org's farmers via RLS, and the query already filters by `organization_id`) already produces the correct rows — only the status filter is wrong.

No other changes: the `QuickAction` description "X pending review" already reads from `stats.pendingFarmers`, so it updates automatically. No DB / RLS / route changes needed.

## Out of scope
- No change to the credit-score work from earlier turns.
- No new "draft" counter; if you want one later (farmers an enumerator hasn't submitted yet) we can add it as a separate card.

## Files
- `src/pages/Dashboard.tsx` — one-line filter change.
