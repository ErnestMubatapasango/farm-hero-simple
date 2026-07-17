## Goal
Produce a downloadable **`KYF_Platform_Walkthrough.docx`** in `/mnt/documents/` that a new team member (mixed technical / non-technical) can read end-to-end to understand how the KYF app works — from farmer onboarding all the way through verification, credit scoring, and analytics — plus every role, admin/org management, and a short technical appendix.

## Deliverable
A single Word document (~15–20 pages) with:
- Cover page + table of contents
- Screenshots embedded at key steps
- Clean semantic headings (H1/H2/H3) so it renders well in Word and Google Docs

Saved to `/mnt/documents/KYF_Platform_Walkthrough.docx` and surfaced with a `<presentation-artifact>` tag.

## Document outline

1. **What is KYF?** — One-page overview: purpose (Know Your Farmer for Zimbabwean smallholders), who uses it, tenancy model (organizations), MVP scope.
2. **The four roles at a glance** — table of `developer`, `super_admin`, `admin`, `enumerator`: what each can see and do; how roles are stored (`user_roles` table, not on profiles).
3. **Getting into the app**
   - Sign up → creates `super_admin` + new organization
   - Invite flow → admins/enumerators join via `invitations` + `AcceptInvite`
   - Login / forgot password / reset password
4. **The farmer journey (end-to-end)** — the core of the doc, following one farmer:
   1. Enumerator opens **Onboarding** (`/onboarding`)
   2. Four-step wizard: Personal → Farm → Crops (+ livestock, farming methods, yield history) → Financial
   3. Record saved as `draft` in `farmers`, linked crops in `farmer_crops`, historical yields in `crop_yield_history`
   4. Uploading documents (ID, land title, receipts, insurance, photos) via `FarmerDocumentsSection` + required-docs checklist
   5. Farmer detail page for review (`/admin/farmer/:id`) — status stepper: draft → submitted → verified/rejected
   6. Admin verifies or rejects each document; farmer status advances
   7. Credit score generated (`credit_scores`) — how the score is derived at a high level, where it appears (`/credit-score`, `/credit-score/:id`)
   8. Analytics dashboard (`/analytics`) rolls the farmer's data into org-level insights
   9. Notifications keep enumerators/admins informed (bell icon, `notifications` table)
5. **Feature reference (by page)** — one short section per route explaining what it does and who can access it:
   - `/` Dashboard, `/onboarding`, `/admin/farmers`, `/admin/farmer/:id`, `/admin/farmer/:id/edit`, `/documents`, `/analytics`, `/credit-score`, `/admin`, `/admin/users`, `/admin/roles`, `/admin/invitations`, `/profile`
6. **Admin & organization management**
   - Creating an organization (auto on first sign-up)
   - Inviting users, choosing role, accepting an invite
   - Managing users and roles (`/admin/users`, `/admin/roles`)
   - Farmer activity log (audit trail)
7. **Notifications** — what triggers them and how to read them.
8. **Technical appendix** (short, for the developer half of the audience)
   - Stack: React 18 + Vite + shadcn/ui + react-router + Supabase
   - Tables: `organizations`, `profiles`, `user_roles`, `invitations`, `farmers`, `farmer_crops`, `crop_yield_history`, `farmer_documents`, `credit_scores`, `farmer_activity_log`, `notifications`
   - RLS + `has_role()` security-definer function
   - Route guards: `ProtectedRoute`, `AdminRoute`, `RoleRoute`
   - Storage bucket `farmer-documents` (signed URLs)
   - Edge function `invite-user`

## Screenshots to embed
Captured via Playwright against `localhost:8080` while authenticated as a super_admin (session already injected in the sandbox):
- Login page
- Dashboard
- Onboarding wizard — one shot per step (Personal, Farm, Crops, Financial)
- Admin → Farmers list
- Farmer detail page (with status stepper + documents section)
- Document preview dialog
- Credit score page + detail
- Analytics page
- Admin → Users, Roles, Invitations
- Notifications bell (open)

If a page fails to load in the harness, it will be described in text instead and the doc will note it.

## Build steps
1. Read the remaining page components I haven't seen yet (`Dashboard.tsx`, `AdminFarmers.tsx`, `AdminFarmerDetail.tsx`, `AdminUsers.tsx`, `AdminRoles.tsx`, `AdminInvitations.tsx`, `CreditScore.tsx`, `CreditScoreDetail.tsx`, `Login.tsx`, `AcceptInvite.tsx`, `AppSidebar.tsx`, `credit-score-service.ts`, `useAuth.tsx`, `App.tsx` for the route map) so the writeup is accurate.
2. Playwright script under `/tmp/browser/walkthrough/` that logs in (using the injected Supabase session), visits each route above, and screenshots to `/tmp/browser/walkthrough/screenshots/`. View each screenshot to confirm it's a real page render (not a spinner or blank).
3. Generate the .docx with `docx-js` following the DOCX skill (US Letter, Arial, proper heading styles with `outlineLevel`, TOC, images embedded via `ImageRun` with base64, tables via `WidthType.DXA` + matching `columnWidths`, semantic-typography rules).
4. Validate the .docx with the skill's `validate_document.py`, convert to PDF, render each page to JPEG, and eyeball every page for overflow / broken layout / missing images. Fix and re-render if needed.
5. Save to `/mnt/documents/KYF_Platform_Walkthrough.docx` and surface with `<presentation-artifact>`.

No code changes to the app, no schema changes, no new dependencies added to the project (docx-js used only inside `/tmp`).

## Out of scope
- Full API reference or per-column schema docs (mentioned as a table only)
- Video walkthrough
- Localization of the document
