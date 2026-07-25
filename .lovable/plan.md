
# KYF Pre-Production Remediation Plan

Structured to mirror the review's roadmap. Each phase is independently shippable. Finding IDs (F-XX-n) map to the review document.

---

## Phase 0 — Foundation & Quick Wins (Launch Blockers)

Goal: make the repo reproducible, close the three critical gaps, land the highest-value low-effort fixes.

### 0.1 Reconcile migrations with live DB (F-DB-1) — CRITICAL
- Run `supabase db diff` against the live project.
- Commit a single reconciliation migration covering: `farmers` column renames (`county→region`, `sub_county→district`, `farm_size_acres→farm_size_hectares`, drop `farming_type`), the missing `notifications` table DDL + RLS + Realtime publication, and any other drift.
- Add a CI job that spins up a shadow Postgres, replays all migrations, regenerates types, and diffs against committed `src/integrations/supabase/types.ts`.
- Freeze rule: no more dashboard SQL edits — all schema changes via migration files.

### 0.2 Server-authoritative credit score (F-BE-1) — CRITICAL
- New migration: `compute_credit_score(_farmer_id uuid)` — security-definer plpgsql that reads inputs, computes, and upserts into `credit_scores`. Add columns: `engine_version text`, `computed_at timestamptz` (provenance).
- `REVOKE INSERT, UPDATE ON public.credit_scores FROM authenticated;` — clients read-only.
- Update `src/lib/credit-score-service.ts` to call the RPC; keep the TS engine as the reference implementation (used only for tests until parity).

### 0.3 Complete revocation enforcement (F-SEC-1, F-SEC-2, F-SEC-3) — CRITICAL
- `revoke_invitation` migration: also `UPDATE profiles SET organization_id = NULL` for revoked users. Verify `enrolled_by` name lookups still work (they join on `user_id`, not org).
- Storage policies migration:
  - SELECT/INSERT/UPDATE/DELETE on `farmer-documents` bucket: require the caller to hold *any* org role via `has_role(...)` in addition to folder-org match.
  - INSERT/UPDATE/DELETE: add predicate binding path segment `folder[1]` to `farmers.organization_id` of `folder[2]` — closes cross-tenant upload.
- `farmer_activity_log` INSERT policy: add role requirement.
- `useAuth.checkRevoked`: switch from "any historical revoked row" to "no active roles" so re-invited users aren't locked out. Keep the client sign-out as UX sugar only.
- Reduce Supabase JWT expiry to ≤ 1 hour.

### 0.4 Quick wins bundle
- **FKs (F-DB-2):** `farmer_documents.farmer_id`, `credit_scores.farmer_id`, `farmer_activity_log.farmer_id` → `REFERENCES farmers(id) ON DELETE CASCADE` (log optional — decide at migration time).
- **Dedup (F-DB-4):** partial unique index `farmers(organization_id, national_id) WHERE national_id IS NOT NULL` + client duplicate-search hint in the wizard.
- **Notifications producer (F-BE-5):** trigger on `farmers` verify/reject writing `notifications` rows (companion to existing `notify_enumerator_on_status_change` — commit its DDL as part of 0.1).
- **Reject dialog (F-FE-2):** replace `window.prompt`/`window.confirm` with shadcn `AlertDialog` + required-reason `Textarea`.
- **AcceptInvite stale closure (F-FE-3):** use a `readyRef`, clear the timer in the auth callback, render error only when `!ready`.
- **Dashboard counts (F-PF-1):** switch to four `head:true, count:"exact"` queries.
- **Dead code:** delete `src/lib/mock-data.ts`, `src/App.css`, `auth-attacher.ts`/`auth-middleware.ts` stubs.
- **README + `index.html` meta:** real README, remove Lovable OG/twitter defaults, add `.env.example`.

---

## Phase 1 — Trust the Server

Goal: move remaining trusted logic behind RPCs, enforce workflow.

### 1.1 Transactional `save_farmer` RPC (F-BE-2)
- New `save_farmer(_farmer jsonb, _crops jsonb, _yields jsonb, _mode text)` — one transaction, calls `can_edit_farmer` internally, handles both create and edit (delete-then-insert crops/yields becomes atomic).
- Refactor `FarmerForm` submit path to call this RPC.

### 1.2 `create_organization` RPC (F-BE-3)
- Security-definer RPC invoked on first authenticated sign-in: creates org, links profile, grants `super_admin` — idempotent.
- Replace client sequence in signup flow. Test in staging with email confirmation ON.

### 1.3 State machine trigger (F-SEC-4, F-BL-2, F-BL-3)
- BEFORE UPDATE trigger on `farmers` enforcing allowed transitions: `draft→submitted`, `submitted→verified|rejected`, `rejected→draft|submitted`, `verified→submitted` (super_admin only).
- Enforce required-docs check server-side on `→submitted`.
- Restrict which columns are mutable when `status='verified'`.

### 1.4 Correct credit-score engine (F-BL-1)
- Either capture `annual_expenses` and `loan_status` in the wizard/schema OR remove those pillars and re-weight.
- Fix growth math: per-crop then average.
- Make unreachable factors explicit ("not yet assessed") in the breakdown.
- Full unit-test suite for the pure function.
- Only after tests pass, port to the server-side RPC from 0.2.

### 1.5 Rejection reason column (F-SEC-5)
- Migration: add `farmers.rejection_reason text`; stop overwriting `notes`.
- Update audit trigger + UI accordingly.

### 1.6 Edge function hardening (F-BE-4)
- Pin CORS to app origin(s); document/enforce `verify_jwt = true` invariant (comment + startup assertion or `jose` verification).
- Insert `invitations` row *before* `inviteUserByEmail`; mark failed sends.
- Generic error message on invite (no email enumeration); simple per-caller rate limit.

### 1.7 TypeScript strictness (F-CQ-1)
- Enable `strict: true` incrementally (start with `noImplicitAny` + `strictNullChecks`).
- Replace `any` in `credit-score-service.ts` and page models with generated `Database["public"]["Tables"][...]` types.
- Add `@typescript-eslint/no-explicit-any` as warning.

---

## Phase 2 — Test, Observe, Comply

### 2.1 Test suite
- **Credit-score engine unit tests** — table-driven per pillar + band boundaries + F-BL-1 regressions.
- **RLS persona suite** — pgTAP or Vitest hitting local Supabase with three personas (enum A, admin A, enum B/org B). Cover cross-tenant matrix, revocation, storage path binding.
- **Playwright happy paths** — signin → onboard → upload → submit → verify → score; invite → accept; revoke → access ends.
- **CI (GitHub Actions):** typecheck (strict) · lint · unit · migration replay + type diff · Playwright.

### 2.2 Observability
- Sentry SDK for SPA and edge functions.
- Supabase log drains + alerts on auth/RLS error spikes.
- Confirm PITR on plan; complete and time one restore drill.

### 2.3 CDPA compliance (F-BL-4)
- Consent step in wizard (checkbox + timestamp + enumerator attestation stored on farmer row).
- Retention policy document; erasure tooling (cascade delete + storage sweep).
- Document read-audit position; consider wrapping signed-URL issuance in an RPC to log document reads.

---

## Phase 3 — Quality & Scale (Post-launch)

- **F-FE-1:** adopt `useQuery`/`useMutation` page-by-page; configure `QueryClient` (retry, offline).
- **F-PF-1 extended:** consolidate dashboard into a single `dashboard_stats()` RPC; leaderboard as grouped SQL.
- **F-DB-3/5:** composite indexes; `pg_trgm` GIN for search once >10k farmers; CHECK constraints on numeric ranges.
- **F-PF-2:** route-level code splitting with `React.lazy`.
- **F-FE-5:** per-step wizard validation, `aria-label`s, text+icon status badges, focus management.
- **Currency decision:** USD-only in MVP OR wire a daily-rate fetcher. Remove static FX table.
- **Multi-org decision (§3.3):** decide before signing a managing-agent customer — either enforce single-org (unique constraint, drop org-set logic) or make org an explicit session context.
- **F-CQ-2/3:** convert `useCurrency` to `.tsx`, rename `amountInGHS→amountUsd`, extract `enrichWithProfiles()` helper, `is_org_admin()` SQL helper.
- **F-FE-4:** wrap `/credit-score*` routes in `AdminRoute`.
- **F-BL-5:** key invitation acceptance to specific invitation id via metadata.
- Hide/badge `/documents`, `/analytics` placeholder pages.

---

## Technical details

### New RPCs to create
| RPC | Purpose | Phase |
|---|---|---|
| `compute_credit_score(_farmer_id)` | Server-side scoring | 0 |
| `save_farmer(_f, _c, _y, _mode)` | Transactional farmer write | 1 |
| `create_organization(_name)` | Idempotent first-org bootstrap | 1 |
| `dashboard_stats()` | Single-round-trip KPIs | 3 |

### New triggers
- Notifications producer on `farmers` status change (0.4).
- Status transition state machine on `farmers` UPDATE (1.3).

### Files most impacted
- `supabase/migrations/*` — 6-8 new migrations across phases 0-1.
- `supabase/functions/invite-user/index.ts` — hardening (1.6).
- `src/lib/credit-score.ts` + `credit-score-service.ts` — engine fixes + RPC call (0.2, 1.4).
- `src/components/onboarding/FarmerForm.tsx` — RPC-based save (1.1), consent step (2.3), per-step validation (Phase 3).
- `src/pages/AdminFarmerDetail.tsx` — reject dialog (0.4), rejection_reason column (1.5).
- `src/pages/AcceptInvite.tsx` — stale-closure fix (0.4).
- `src/pages/Dashboard.tsx` — count queries (0.4), later RPC (Phase 3).
- `src/hooks/useAuth.tsx` — revocation check refactor (0.3).
- `tsconfig*.json` — strict mode (1.7).
- `.github/workflows/ci.yml` — new (Phase 2).

### Deliberately out of scope
- Rewriting the architecture (BaaS pattern is correct).
- Building the `/documents` and `/analytics` pages — hide/badge them instead.
- MFA — flagged in OWASP snapshot but not a launch blocker.

---

## Suggested sequencing

Recommend implementing **Phase 0 in one PR train** (biggest risk reduction per hour), then Phases 1-2 as parallel work streams. Phase 3 is post-launch quality.

If you want, I can start with **Phase 0.1 (migration reconciliation)** since every other DB change stacks on top of it — or with the **Phase 0 Quick Wins bundle** for immediate visible improvement. Let me know which slice to build first, or approve the whole plan and I'll start at 0.1.
