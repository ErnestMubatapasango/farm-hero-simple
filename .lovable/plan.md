# Single role per user + developer org browser

## What changes

**1. One role per user (dropdown instead of checkboxes)**

The "Edit roles" dialog on the Users page becomes "Edit role" with a single-select dropdown. Saving replaces whatever roles the user has in that organization with the one selected.

Dropdown contents depend on who is editing and who is being edited:

- A super admin sees only **Admin** and **Enumerator**. Super admin is never an option for them (they cannot mint another super admin, and cannot demote themselves).
- If the user being edited already holds **Super admin**, the dialog does not offer role changes to a super admin editor — it shows a read-only note that only a platform developer can change an organization owner's role.
- A developer sees **Super admin**, **Admin** and **Enumerator**, so platform support can transfer ownership.
- The platform-level **Developer** role is never selectable in this UI.

**2. Developer view grouped by organization**

For developers, the Users page opens on a list of organizations (name, slug, member count) instead of a flat member list. Selecting one loads that organization's members with their role. A back control returns to the organization list, and the selected organization name is shown in the header.

Super admins and admins see their own organization's members directly, exactly as today.

**3. Role badges**

Members render a single role badge (falling back to "No role" when a user has none), instead of a row of badges.

## Technical notes

- `src/pages/AdminUsers.tsx`: replace `selectedRoles: AppRole[]` with `selectedRole: AppRole | null`, swap the checkbox list for a shadcn `Select`, and call `set_user_roles` with a one-element array. Add developer-only organization list state fetched from `public.organizations` (its select policy already allows `has_role(auth.uid(),'developer')`), with member counts from `public.profiles` grouped by `organization_id` (the profiles select policy also allows developers). `list_org_members(_org_id)` already accepts any org for a developer, so no new RPC is needed for members.
- `src/lib/permissions.ts`: add a helper that returns the assignable roles for a given caller and target user (`assignableRolesFor(callerRoles, targetRoles)`), encoding the super-admin rules above; keep `canGrantRole` as the primitive it builds on.
- No migration required. `set_user_roles` already enforces the same rules server-side: only a developer can grant `super_admin` or `developer`, and a super admin cannot strip their own `super_admin`. Passing a single-element array works with the existing signature, and because the function wipes existing org roles first, the result is exactly one role per user per organization.
- Existing users who somehow hold two org roles will be normalized to one the first time their role is edited; no bulk data change is made.
