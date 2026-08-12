# Role management with editable, enforced permissions

Rebuild `/admin/roles` as a real permission matrix: three manageable roles (Super admin, Admin, Enumerator), each with a grouped list of permissions and a toggle. Toggles are saved and actually enforced by the database, not just used to hide buttons.

`developer` is excluded from the list — it stays platform-level and always passes every permission check.

## Permission catalog

Grouped, one toggle each:

**Farmers**
- Onboard farmers
- View own farmers
- View all farmers in the organization
- Edit any farmer record
- Submit farmers for review
- Verify farmers
- Reject farmers
- Reopen a verified farmer
- Export farmers to CSV

**Documents**
- Upload farmer documents
- View farmer documents
- Verify / reject documents

**Analytics**
- View farm health analytics
- View organization analytics
- View credit scores
- Recompute credit scores

**Team**
- View team members
- Invite users
- Revoke access
- Manage roles
- Manage role permissions
- Manage organization settings

## Defaults (what ships)

```text
                            Super admin  Admin  Enumerator
Onboard farmers                  on       on       on
View own farmers                 on       on       on
View all farmers                 on       on       off
Edit any farmer                  on       on       off
Submit for review                on       on       on
Verify / reject farmers          on       on       off
Reopen verified farmer           on       off      off
Export CSV                       on       on       off
Upload documents                 on       on       on
View documents                   on       on       on
Verify / reject documents        on       on       off
Farm health analytics            on       on       on
Organization analytics           on       on       off
View credit scores               on       on       off
Recompute credit scores          on       on       off
View team                        on       on       off
Invite users                     on       off      off
Revoke access                    on       off      off
Manage roles                     on       off      off
Manage role permissions          on       off      off
Organization settings            on       off      off
```

## Who can edit which toggles

- **Developer** edits the platform-wide defaults. This is the baseline every new organization inherits.
- **Super admin** edits their own organization's overrides for **Admin** and **Enumerator** only. Their own Super admin row is shown read-only so they cannot lock themselves out.
- Anyone without "Manage role permissions" sees the matrix read-only (switches disabled) — Admins get a view-only reference.

A per-organization toggle that has never been touched shows the platform default and is labelled as inherited; a "Reset to default" control per role clears the overrides.

## Screen behaviour

- Role selector at the top (3 tabs / segmented control) plus a compact matrix view on wide screens.
- Each permission row: label, one-line description, switch, and an "Inherited" hint when no org override exists.
- Switching a toggle saves immediately with an optimistic update and a toast; failures roll the switch back.
- For developers, an organization picker lets them view/edit a specific organization's overrides or the platform defaults.

## Technical notes

**Migration**
- `public.permissions` — catalog: `key` (PK text), `label`, `description`, `category`, `sort_order`. Seeded with the list above. Readable by `authenticated`, writable only by `service_role`.
- `public.role_permission_defaults` — `(role app_role, permission_key)` PK, `enabled boolean`. Seeded from the default table. Readable by `authenticated`; writes restricted to `developer`.
- `public.org_role_permissions` — `(organization_id, role, permission_key)` PK, `enabled boolean`, `updated_by`, timestamps. Readable by org members; writes allowed to `developer` and to a `super_admin` of that org for `admin`/`enumerator` rows only (enforced in the RPC, with RLS as a second gate).
- Each new table gets `GRANT` statements, RLS enabled, and policies.
- `public.has_permission(_user_id uuid, _perm text, _org_id uuid) returns boolean` — security definer, stable: `true` for `developer`; otherwise true if any of the user's roles in `_org_id` resolves to enabled via `org_role_permissions` (if a row exists) else `role_permission_defaults`.
- `public.set_role_permission(_org_id uuid, _role app_role, _permission_key text, _enabled boolean)` — security definer; writes an org override, or a platform default when `_org_id is null` (developer only). Enforces the editing rules above and rejects `developer` as a target role.
- `public.reset_role_permissions(_org_id uuid, _role app_role)` — deletes that role's org overrides.
- Rewire existing server checks to `has_permission` instead of hardcoded role lists: `can_view_farmer` (`farmers.view_all` / own-record fallback), `can_edit_farmer` (`farmers.edit_any` / own draft+rejected via `farmers.onboard`), `farmers_state_machine` (verify/reject/reopen), `compute_credit_score` (`credit.view`), `set_user_roles` (`team.manage_roles`), `revoke_invitation` (`team.revoke`). Role-escalation rules in `set_user_roles` stay as-is on top of the permission check.

**Frontend**
- `src/lib/permissions.ts`: add typed `PERMISSIONS` keys and keep the existing `isOrgOwner` / `isOrgAdmin` helpers for pure role questions; replace capability helpers (`canVerifyFarmers`, `canInviteUsers`, …) with lookups against the loaded permission set.
- New `src/hooks/usePermissions.tsx` — provider that loads the caller's effective permissions once (via a `my_permissions()` view/RPC) and exposes `can(key)`; mounted next to `AuthProvider`.
- Update call sites currently using the capability helpers (`AppSidebar`, `Admin`, `AdminUsers`, `AdminFarmers`, `AdminFarmerDetail`, `Documents`, `EditFarmer`, `FarmerAnalyticsCard`, `AdminRoute`, `RoleRoute`) to use `can(...)`.
- Rewrite `src/pages/AdminRoles.tsx` as the matrix screen; route guard becomes "has `team.manage_permissions` or is org admin (read-only)".
