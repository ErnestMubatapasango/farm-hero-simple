## Goal

Implement **scoped editable ownership** for farmer records: enumerators can only edit farmers they onboarded, only while in editable statuses (`draft` / `rejected`). Verified records become immutable to enumerators. Add workflow statuses, audit fields, and an activity log.

---

## 1. Database changes (migration)

### `farmers` table — add columns

- `created_by uuid` — set to enumerator's `auth.uid()` on insert (mirrors `enrolled_by` but explicit for ownership semantics; we'll keep `enrolled_by` and treat `created_by` as the canonical ownership column going forward, defaulting backfill from `enrolled_by`).
- `updated_by uuid` — last user who modified the record.
- `submitted_at timestamptz` — when enumerator submitted for review.

### `farmers.status` — expand allowed values

Currently: `pending | verified | rejected`.
New workflow:

- `draft` (default for new records)
- `submitted` (enumerator finished, awaiting admin)
- `under_review` (admin actively reviewing — optional, can defer)
- `verified` (locked)
- `rejected` (back to enumerator with notes)

Change default from `'pending'` → `'draft'`. Backfill existing `pending` rows → `submitted`.

### New table: `farmer_activity_log`

Columns:

- `id uuid pk`
- `farmer_id uuid` (the farmer)
- `organization_id uuid`
- `actor_id uuid` (who did it)
- `action text` (`created` | `updated` | `submitted` | `verified` | `rejected` | `status_changed`)
- `from_status text`, `to_status text` (nullable, for status changes)
- `changes jsonb` (nullable, diff of changed fields for updates)
- `notes text` (nullable, admin rejection reason etc.)
- `created_at timestamptz default now()`

RLS: org members can view; inserts allowed for authenticated users in the same org (the trigger writes them).

### Trigger: auto-log on `farmers` changes

A `BEFORE UPDATE` trigger sets `updated_by = auth.uid()` and `updated_at = now()`.
An `AFTER INSERT/UPDATE` trigger writes a row into `farmer_activity_log`.

### RLS rewrite for `farmers.UPDATE`

Replace the current "admins can update farmers in their org" policy with **two** policies:

1. **Enumerators can update own editable farmers**
  ```
   USING (
     enrolled_by = auth.uid()
     AND status IN ('draft', 'rejected')
     AND has_role(auth.uid(), 'enumerator', organization_id)
   )
   WITH CHECK (
     enrolled_by = auth.uid()
     AND status IN ('draft', 'rejected', 'submitted')  -- can transition to submitted
   )
  ```
2. **Admins/super_admins/developers can update any farmer in their org** (existing rule, unchanged).

### RLS for `farmer_crops` / `crop_yield_history`

Mirror the same rule: enumerators can only insert/update rows belonging to farmers they own where farmer status is `draft` or `rejected`. Use a security-definer helper `can_edit_farmer(_farmer_id uuid)` to avoid duplicating logic.

---

## 2. Frontend changes

### `src/pages/Onboarding.tsx`

- Insert farmers with `status: 'draft'` (instead of relying on default `pending`).
- Add a "Save draft" vs "Submit for review" choice at the end:
  - "Save draft" → keeps `status = 'draft'`.
  - "Submit" → sets `status = 'submitted'`, `submitted_at = now()`.
- Set `created_by: user.id` explicitly.

### `src/pages/AdminFarmers.tsx`

- Update status filter tabs to: `all | draft | submitted | verified | rejected` (counts updated).
- Status badge icons updated for new states.
- For enumerators (non-admin), the existing org-scoped query naturally limits visibility, but add `.eq('enrolled_by', user.id)` when the current user has only the `enumerator` role (no admin/super_admin) to enforce "see only own farmers" client-side as well.

### `src/pages/AdminFarmerDetail.tsx`

- Show status prominently with a badge.
- Show "Last updated by … at …" and a collapsible **Activity timeline** sourced from `farmer_activity_log`.
- Action buttons depend on role + status:
  - Enumerator + status `draft|rejected` → "Edit" + "Submit for review".
  - Admin/super_admin + status `submitted` → "Verify" + "Reject (with notes)".
  - Anyone viewing `verified` → read-only banner ("Locked — verified record").
- Reject flow: prompt for notes, write to `farmers.notes` and `farmer_activity_log.notes`.

### New: edit page for farmers

Reuse onboarding form in "edit mode" at `/admin/farmer/:id/edit`, gated to editable status + ownership. Pre-fills from existing farmer record.

---

## 3. Out of scope (confirm or defer)

- `under_review` intermediate state — **defer** unless you want admins to "claim" a record before verifying. Simpler 4-state workflow (`draft → submitted → verified|rejected`) is enough for MVP.
- Soft-delete for farmers — currently only super_admin can delete. Leave as-is.
- Per-field diff in activity log — start with full `changes jsonb` snapshot of changed columns; refine later.

---

## Questions before I implement

1. **Workflow states**: 4-state (`draft / submitted / verified / rejected`) or 5-state (add `under_review`)? I recommend 4-state for MVP.
2. `**created_by` vs `enrolled_by**`: keep both (enrolled_by = ownership, created_by = redundant) or rename? I recommend **keeping `enrolled_by**` as the ownership column and NOT adding `created_by` — it already exists and serves the same purpose. Just add `updated_by` and `submitted_at`.
3. **Edit UI**: reuse the onboarding form as `/admin/farmer/:id/edit`, or build a dedicated inline-edit panel on the detail page?
4. **Activity log scope**: log every field change, or only status transitions + a "record edited" event for MVP?  
  
