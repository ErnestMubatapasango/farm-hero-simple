# Fix: invite flow fails on the custom domain, and document validation blocks submit

## 1. Invitations — "Failed to send a request to the Edge Function"

Confirmed: the `invite-user` function has **no logs at all** for these attempts, so the browser request never reached the function. Its CORS allow-list only accepts `localhost`, `*.lovable.app` and `*.lovableproject.com`. The screenshot is from `kyfplatform.org`, so the browser preflight is answered with `Access-Control-Allow-Origin: http://localhost:8080` and the call is blocked before any invite logic runs.

Fix:
- Add the production domains (`https://kyfplatform.org`, `https://www.kyfplatform.org`) to the allowed origins, and echo back any exact match instead of falling back to localhost.
- Return the CORS headers on the `OPTIONS` preflight and on every error response (already partly done) so failures surface as real messages rather than a generic network error.
- Keep the redirect target derived from the calling origin, so invite emails from the custom domain link back to `https://kyfplatform.org/accept-invite`.

After the change, invite errors will be readable in the UI (e.g. "already a member") instead of "Failed to send a request to the Edge Function".

## 2. Documents — "National ID and Land Title documents are required to submit for review"

Confirmed root cause: a naming mismatch, not a missing upload.

- The upload UI stores the National ID with `document_type = 'id'` (the table's CHECK constraint allows `'id'` and does **not** allow `'national_id'`).
- The submit-gate trigger on `farmers` looks for `document_type = 'national_id'`.

So the gate can never be satisfied — every "Submit for Review" fails even when both documents are uploaded and verified (the live data confirms documents are stored as `id`).

Fix:
- Update the submit-gate trigger to accept `document_type IN ('id','national_id')` for the National ID requirement, and to ignore `rejected` documents (a rejected upload should not count as satisfied).
- Keep `'id'` as the canonical value used by the UI and checklist, so no data migration is needed.
- Align the frontend gate in `AdminFarmerDetail` / the checklist with the same rule (ignore rejected), so the button state matches what the database will allow.

## Technical notes

- Edge function change: `supabase/functions/invite-user/index.ts`, `ALLOWED_ORIGINS` + `corsFor()`.
- Migration: `CREATE OR REPLACE FUNCTION` for the farmer status-transition trigger function, changing only the two required-doc `EXISTS` checks; all other transition rules and immutability rules stay identical.
- Frontend: `src/components/farmer/RequiredDocumentsChecklist.tsx` (`hasAllRequiredDocs` excludes rejected-only cases) — no visual redesign.
