import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Single source of truth for role-based capabilities in the UI.
 * Server-side RLS + security-definer functions remain the real boundary;
 * these helpers only decide what to render.
 */
export const PLATFORM_ROLES: AppRole[] = ["developer"];
export const ORG_OWNER_ROLES: AppRole[] = ["super_admin", "developer"];
export const ORG_ADMIN_ROLES: AppRole[] = ["admin", "super_admin", "developer"];
export const FIELD_ROLES: AppRole[] = ["enumerator", "admin", "super_admin", "developer"];

const has = (roles: AppRole[], allowed: AppRole[]) => allowed.some((r) => roles.includes(r));

export function isPlatformDeveloper(roles: AppRole[]) {
  return has(roles, PLATFORM_ROLES);
}

/** Organization owner: invitations, revocation, role management. */
export function isOrgOwner(roles: AppRole[]) {
  return has(roles, ORG_OWNER_ROLES);
}

/** Organization operations: sees every farmer in the org, verifies records. */
export function isOrgAdmin(roles: AppRole[]) {
  return has(roles, ORG_ADMIN_ROLES);
}

/** Field data capture, scoped to own records. */
export function isFieldAgentOnly(roles: AppRole[]) {
  return roles.includes("enumerator") && !isOrgAdmin(roles);
}

export const canOnboardFarmers = (roles: AppRole[]) => has(roles, FIELD_ROLES);
export const canVerifyFarmers = (roles: AppRole[]) => isOrgAdmin(roles);
export const canVerifyDocuments = (roles: AppRole[]) => isOrgAdmin(roles);
export const canViewOrgAnalytics = (roles: AppRole[]) => isOrgAdmin(roles);
export const canViewCreditScores = (roles: AppRole[]) => isOrgAdmin(roles);
export const canExportFarmers = (roles: AppRole[]) => isOrgAdmin(roles);
export const canViewTeam = (roles: AppRole[]) => isOrgAdmin(roles);
export const canInviteUsers = (roles: AppRole[]) => isOrgOwner(roles);
export const canRevokeAccess = (roles: AppRole[]) => isOrgOwner(roles);
export const canManageRoles = (roles: AppRole[]) => isOrgOwner(roles);
export const canGrantRole = (roles: AppRole[], target: AppRole) => {
  if (isPlatformDeveloper(roles)) return true;
  if (!isOrgOwner(roles)) return false;
  return target === "admin" || target === "enumerator";
};
export const canSeeAllOrganizations = (roles: AppRole[]) => isPlatformDeveloper(roles);

/** Selectable roles (single-role model) for a caller editing a given target user. */
export const ASSIGNABLE_ROLE_ORDER: AppRole[] = ["super_admin", "admin", "enumerator"];

export function assignableRolesFor(callerRoles: AppRole[], targetRoles: AppRole[]): AppRole[] {
  if (isPlatformDeveloper(callerRoles)) return ASSIGNABLE_ROLE_ORDER;
  if (!isOrgOwner(callerRoles)) return [];
  // A super admin cannot change an organization owner's role at all.
  if (targetRoles.includes("super_admin") || targetRoles.includes("developer")) return [];
  return ASSIGNABLE_ROLE_ORDER.filter((r) => canGrantRole(callerRoles, r));
}

/** The single effective org role for a member row. */
export function primaryRole(roles: AppRole[]): AppRole {
  if (roles.includes("developer")) return "developer";
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  return "enumerator";
}

export const ROLE_LABELS: Record<AppRole, string> = {
  developer: "Developer",
  super_admin: "Super admin",
  admin: "Admin",
  enumerator: "Enumerator",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  developer: "Platform level. Cross-organization access for support and debugging.",
  super_admin:
    "Organization owner. Everything an admin can do, plus invitations, revocation and role management.",
  admin: "Organization operations. Views and verifies every farmer in the org, no people management.",
  enumerator: "Field data capture. Onboards farmers and manages only their own records.",
};
