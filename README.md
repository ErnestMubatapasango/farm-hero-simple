# KYF — Know Your Farmer

A multi-tenant platform for enrolling, verifying and credit-scoring smallholder farmers.

- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui.
- **Backend:** Supabase (Postgres, RLS, Storage, Edge Functions).
- **Roles:** `developer`, `super_admin`, `admin`, `enumerator` — scoped per organization.
- **Workflow:** `draft → submitted → verified | rejected`, with server-enforced transitions and required-documents gate.

## Local development

```bash
bun install
bun run dev
```

Copy `.env.example` to `.env` and fill in the Supabase project values. Migrations live under `supabase/migrations/` and are the single source of truth for schema — do not edit the database from the dashboard.

## Key architectural rules

- Roles are stored in `public.user_roles`, never on `profiles`.
- Credit scores are computed by the `compute_credit_score` Postgres RPC; clients cannot write to `credit_scores`.
- Farmer status transitions are enforced by the `farmers_state_machine` trigger.
- Invitations flow through the `invite-user` edge function which requires `super_admin` or `developer` on the target org.
- Revocation clears `user_roles` and the profile's `organization_id`, and signs the user out over realtime.

## Deploy

Publish via Lovable — see the Publish button in the top-right of the editor.
