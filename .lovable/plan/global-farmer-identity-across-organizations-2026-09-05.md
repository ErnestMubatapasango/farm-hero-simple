# Global farmer identity across organizations

Today each organization's farmer record stands alone: the national ID is only unique inside one organization and can be left empty, so the same person enrolled by two organizations becomes two unrelated records. This adds one global "person" record that both organizations point at, without letting either see the other's data.

Confirmed in the current data: 4 farmer records, one national ID (`63-1234567A63`, Tendai Moyo) already exists twice — once in each of two organizations. That pair is exactly the case the change must link.

## What changes for users

- Every farmer must have a valid national ID before their record can be submitted or verified. Blank or badly formatted IDs are rejected with a clear message.
- During onboarding, typing the national ID looks up whether that person is already known to the platform. If they are, the new record is attached to the same person; if not, a new person entry is created.
- If the person is already enrolled *in your own organization*, onboarding stops and points to the existing record instead of creating a duplicate.
- What an organization can see does not change at all: only its own farmer records, nothing from any other organization — even when both are linked to the same person.

## Database migration (reviewable, one migration)

1. `farmer_identities`
   - `id`, `national_id` (text, NOT NULL, UNIQUE, format-checked), `full_name`, `date_of_birth`, `created_at`, `updated_at` + updated-at trigger.
   - Format check for Zimbabwe IDs, applied to a normalized value (uppercased, trimmed): `^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$`.
   - Grants: `SELECT` to `authenticated`, `ALL` to `service_role` (no `anon`). RLS enabled; no direct read of the table by users — reads go through security-definer functions only, so an ID cannot be used to enumerate people. A single policy allows `developer` to read for support purposes.

2. `farmers.identity_id uuid REFERENCES public.farmer_identities(id)`, indexed.

3. Backfill (in the same migration)
   - Insert one identity per distinct normalized `national_id` from existing `farmers`, taking name/DOB from the most recently updated record for that ID.
   - Update `farmers.identity_id` to match. This links the two Tendai Moyo records to one identity.
   - Rows whose national ID does not match the Zimbabwe format are left unlinked rather than failing the migration; they are reported and must be corrected before they can be submitted/verified again.

4. Constraints
   - `UNIQUE (organization_id, identity_id)` — at most one farmer record per person per organization.
   - Keep the existing `(organization_id, national_id)` unique index.
   - Trigger `farmers_require_identity`: when status is `submitted` or `verified`, `national_id` must be present, format-valid, and `identity_id` must be set. Drafts may still be incomplete so enumerators can save work in progress.
   - Constraints added `NOT VALID` then validated, as with the earlier bounds work.

5. `public.resolve_farmer_identity(_national_id text, _full_name text, _dob date)` — security definer, returns the identity id, creating it if absent and refreshing name/DOB when previously blank. Returns nothing about other organizations.

6. `public.check_farmer_identity(_national_id text)` — security definer lookup used by onboarding. Returns only: whether the person is known, their canonical name/DOB, whether **the caller's own** organization already has a record for them, and that record's id. It never returns other organizations' record ids, counts, or names.

7. `save_farmer` — extended, everything else unchanged:
   - normalize and validate `national_id`; raise `'A valid national ID is required'` on create when missing/invalid;
   - resolve the identity and set `identity_id` on insert/update;
   - on create, raise a clear "already enrolled in this organization" error when the identity already exists for the caller's org.

## RLS: nothing weakened

No existing policy on `farmers`, `farmer_crops`, `crop_yield_history`, `farmer_documents`, `credit_scores`, `farm_health_scores` or `farmer_activity_log` is dropped or relaxed. Every farmer-scoped policy stays keyed on `organization_id` / `enrolled_by`; `identity_id` is never used to widen visibility, and no policy joins across organizations.

Verification after the migration:
- Query the two orgs that share the Tendai Moyo identity and confirm each sees only its own record when RLS is applied as a member of that org (checked with an authenticated browser session, not the service role).
- Confirm `farmer_identities` returns no rows to a normal org member.
- Confirm submitting a farmer with an empty or malformed national ID is rejected, and that re-enrolling an existing national ID in the same org is rejected.

## Frontend

- `src/lib/farmer-validation.ts`: add `normalizeNationalId` and `validateNationalId` (same regex as the database) plus an inline error message.
- `src/components/onboarding/FarmerForm.tsx`: national ID becomes required on the Personal step with inline validation blocking Next/Submit; on blur, call `check_farmer_identity` and show either "New farmer" or "Known person — <name> (<DOB>)"; if the same organization already has a record, show a link to it and block creation.
- `src/pages/EditFarmer.tsx` / detail views: no behaviour change beyond the shared validation.
- Offline path (`src/lib/offline/farmerRepo.ts`): validate the ID locally when offline; the identity lookup/creation happens on sync, and a sync conflict for an already-enrolled person surfaces as a clear message on the queued record.

## Out of scope

No cross-organization sharing UI, no consent model, no merging of two identities that were typed with different IDs.
