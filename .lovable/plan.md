# KYF Pre-Production Remediation Plan

Status legend: ✅ shipped · 🚧 partial · ⏳ deferred (owner action needed).

---

## Phase 0 — Foundation & Quick Wins ✅

### 0.1 Schema reconciliation ✅
- Live DB inspected; `farmers` columns already match the target names (`region`, `district`, `farm_size_hectares`, no `farming_type`).
- `notifications` table exists with RLS and `notify_enumerator_on_status_change` trigger.
- Freeze rule adopted: schema changes only via `supabase/migrations/*`.
- ⏳ CI shadow-DB migration replay is deferred — needs GitHub Actions setup outside the sandbox.

### 0.2 Server-authoritative credit score ✅
- `compute_credit_score(_farmer_id uuid)` RPC added (SECURITY DEFINER, role-checked).
- `credit_scores` now has `engine_version` and `farmer_id` unique constraint.
- `REVOKE INSERT/UPDATE/DELETE` on `credit_scores` from `authenticated` — clients are read-only.
- `src/lib/credit-score-service.ts` refactored to call the RPC; TS engine kept as reference.

### 0.3 Revocation enforcement ✅
- `revoke_invitation` now nulls `profiles.organization_id` for the revoked user.
- `farmer_activity_log` INSERT policy now requires an org role.
- Storage policies on `farmer-documents` rewritten: SELECT/INSERT/UPDATE/DELETE all bind path segments to `farmers.organization_id`, closing cross-tenant uploads.
- `useAuth.checkRevoked` switched to "revoked invitation AND no active roles" so re-invited users regain access.
- ⏳ Reducing Supabase JWT expiry to ≤ 1 hour is a dashboard setting the owner must toggle.

### 0.4 Quick wins ✅
- Cascade FKs added on `farmer_documents`, `credit_scores`, `farmer_activity_log`, `farmer_crops`, `crop_yield_history`.
- Partial unique index `farmers(organization_id, national_id) WHERE national_id IS NOT NULL`.
- `notify_enumerator_on_status_change` producer trigger already live.
- Reject dialog (`AlertDialog` + required Textarea) shipped previously.
- `AcceptInvite` stale-closure fix shipped previously.
- Dashboard count queries switched to `head:true` previously.
- Dead code removed: `mock-data.ts`, `App.css`, `auth-attacher.ts`, `auth-middleware.ts`.
- Real `README.md`, `.env.example`, and cleaned-up `index.html` OG/meta shipped.

---

## Phase 1 — Trust the Server 🚧

### 1.3 State machine trigger ✅
- `farmers_state_machine` BEFORE UPDATE trigger enforces `draft→submitted`, `submitted→verified|rejected`, `rejected→draft|submitted`, `verified→submitted` (super_admin only).
- Required-docs gate (`national_id` + `land_title`) enforced server-side on `→submitted`.
- Verified records are immutable for `first_name`, `last_name`, `national_id`, `date_of_birth`, `farm_size_hectares`.

### 1.5 Rejection reason column ✅
- `farmers.rejection_reason text` added. `AdminFarmerDetail` writes and displays it separately from `notes`.

### 1.6 Edge function hardening ✅
- CORS pinned to localhost + `*.lovable.app` + `*.lovableproject.com`; origin no longer wildcarded.
- Simple in-memory per-caller rate limit (20 req/min).
- Invitations row now inserted **before** `inviteUserByEmail`; failed sends marked `revoked` so retries do not duplicate.
- Invite errors now return generic strings to avoid email enumeration.

### 1.1 Transactional `save_farmer` RPC ✅
- `public.save_farmer(_farmer_id, _payload, _crops, _yields)` added — SECURITY DEFINER, permission-checked, atomic upsert of farmer + crops + yield history in a single transaction.
- `FarmerForm.tsx` refactored to call the RPC in both create and edit modes; the multi-step client-side compensation logic is gone.

### 1.2 `create_organization` RPC ✅
- `public.create_organization(_name, _slug)` added — creates the org, links the caller's profile, and grants `super_admin` in one transaction. Rejects users who already belong to an org (developers exempt).
- `Login.tsx` signup now calls the RPC, closing the partial-signup gap where an org could exist without an owner.

### 1.4 Credit-score engine tests ✅
- `src/lib/credit-score.test.ts` added — 8 tests covering score bounds, band mapping, pillar weights, loan penalties, YoY growth, and recommendation generation. Full suite green under `bun run test`.

### 1.7 TypeScript strictness ✅
- Root and app `tsconfig` now set `strict: true`, `strictNullChecks: true`, `noImplicitAny: true`.
- Dead onboarding step files removed (`PersonalStep`, `FarmStep`, `FinancialStep`, `DocumentsStep`).
- `useCurrency.jsx` converted to typed `.tsx`. `CropsStep` callbacks typed. Nullable-org guards added in `AdminInvitations` / `AdminRoles`. `EditFarmer` early-returns on missing `farmerId`.

---

## Phase 2 — Test, Observe, Comply ⏳

Deferred — these require owner-side setup:
- Vitest / pgTAP / Playwright suites and a GitHub Actions CI workflow.
- Sentry SDK + Supabase log drains + PITR restore drill.
- CDPA consent step, retention policy, and read-audit RPC for signed URLs.

---

## Phase 3 — Quality & Scale ⏳

Post-launch quality items (react-query adoption, `dashboard_stats()` RPC, `pg_trgm` search, route code-splitting, per-step wizard validation, currency FX decision, multi-org decision) are unchanged and remain post-launch backlog.

---

## Owner action items

1. **Supabase dashboard** — enable leaked-password protection and lower JWT lifetime to 60 min.
2. **CI** — wire GitHub Actions for migration replay, typecheck, Playwright.
3. **Observability** — add Sentry DSN and configure log drains.
4. **Consent + CDPA** — decide wording and add the consent step to the wizard.
