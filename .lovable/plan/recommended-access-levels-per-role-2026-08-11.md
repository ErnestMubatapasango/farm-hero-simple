# Recommended access levels per role

The app has four roles in the `app_role` enum: `developer`, `super_admin`, `admin`, `enumerator`. Today the code mostly collapses them into two buckets — "admin-ish" (`admin`/`super_admin`/`developer`) and "enumerator" — with only invitations and user management reserved for `super_admin`/`developer`. This plan defines a clear level per role and tightens the places where the current guards are looser than intended.

## Proposed access levels

**Enumerator — field data capture, own records only**
- Onboard farmers; edit own farmers while in `draft` or `rejected`; submit for review.
- Upload documents for own farmers; see the required-documents checklist.
- View own farmers list and their farm-health analytics.
- No verify/reject, no credit scores, no team/invitation/role screens, no other enumerators' farmers.

**Admin — organization operations, read-wide, no people management**
- View and edit all farmers in the org; verify and reject submissions.
- Verify/reject documents; view org analytics and credit scores; CSV export.
- Read-only view of team members. No inviting, no revoking, no role changes.

**Super admin — full owner of one organization**
- Everything Admin can do, plus invite users, revoke access, assign/change roles (limited to `admin` and `enumerator`), and manage organization settings.
- Cannot grant `developer`, cannot touch other organizations.

**Developer — platform level, cross-organization**
- Cross-org visibility for support and debugging; can bootstrap orgs and grant any role.
- Should be rare and clearly marked in the UI as platform-level.

## Gaps to close so the levels above hold

1. Credit score pages are behind `AdminRoute`, so `admin` sees them — intended. Keep, but hide credit scores from enumerators in shared components (currently gated by `isAdmin` in `FarmerAnalyticsCard`, keep consistent).
2. `/admin/users` and `/admin/roles` sit behind `AdminRoute` (admin can reach the pages) while the mutation buttons check `super_admin`/`developer`. Move both routes to `RoleRoute allow={["super_admin","developer"]}`, or give `admin` a read-only members list at a separate route.
3. Role assignment should reject granting `developer` (and granting `super_admin` by a `super_admin`) inside the `set_user_roles` RPC, not just in the UI.
4. Farmer routes (`/admin/farmers`, `/admin/farmer/:id`, `/edit`) are open to any signed-in org member and rely on in-page checks plus RLS. Keep RLS as the real boundary, and make the edit route redirect when `can_edit_farmer` is false rather than rendering a disabled form.
5. Sidebar and Admin landing tiles should render strictly from these levels so no role sees a link it cannot use.

## Technical notes

- Enforcement stays server-side: RLS policies and the `has_role(uid, role, org_id)`, `can_view_farmer`, `can_edit_farmer` security-definer functions. Route guards are UX only.
- Introduce a single `src/lib/permissions.ts` exporting named capabilities (`canVerifyFarmers`, `canInviteUsers`, `canManageRoles`, `canViewCreditScores`, `canEditFarmer`) derived from roles, and use it everywhere instead of ad-hoc `hasAnyRole([...])` arrays.
- Add DB-side guards in `set_user_roles` for the role-escalation rules above.
