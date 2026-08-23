## Technical notes

- New `src/hooks/useActiveOrg.tsx` provider, mounted between `AuthProvider` and
  `PermissionsProvider` in `src/App.tsx`. It exposes
  `{ activeOrganizationId, organizations, setActiveOrganization, isDeveloper, needsOrgSelection }`.
  For non-developers it simply returns `useAuth().organizationId`. For developers
  it loads `public.organizations` (the select policy already allows
  `has_role(auth.uid(),'developer')`) and resolves the active org from
  `localStorage` (`kyf.dev.activeOrg`), falling back to the profile org, else null.
- Pages currently reading `const { organizationId } = useAuth()` switch to
  `useActiveOrg()`: `Dashboard`, `AdminFarmers`, `Documents`,
  `components/analytics/OrgAnalyticsDashboard`, `AdminFarmerDetail`,
  `CreditScore`, `AdminUsers`, `AdminInvitations`, `AdminRoles`, `AppSidebar`,
  `FarmerDocumentsSection`, `onboarding/FarmerForm`. Writes (onboarding, save)
  keep using the real profile org so a developer never accidentally enrols a
  farmer into someone else's org unless they explicitly picked that org — a
  short confirm line in the picker states which org new records land in.
- New `src/components/OrgSwitcher.tsx`: a shadcn `Select` rendered only when
  `isDeveloper`, in the dashboard header and the sidebar footer. Counts come
  from one grouped query each on `profiles` and `farmers` by `organization_id`.
- `src/components/RequireOrg.tsx`: allow through when
  `isPlatformDeveloper(roles)` even with `organizationId === null`, instead of
  the current `roles.length === 0` check only.
- `AdminUsers.tsx` already has a developer organization browser. It will be
  changed to follow the global active organization rather than keeping its own
  local selection, so the picker is the single control.
- No migration needed. RLS and `has_permission` already grant developers
  cross-org read access, and `my_permissions` returns every key for a developer
  regardless of their profile org, so a developer with no organization keeps all
  UI permission gates open.
- Optional and separate from this change: for hands-on testing a developer can
  still create their own organization from the setup screen, which then appears
  in the picker like any other.
