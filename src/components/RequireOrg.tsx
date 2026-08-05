import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Guards the app against orphaned accounts: a signed-in user with no
 * organization and no roles cannot do anything useful, so send them to the
 * setup screen to finish creating their organization.
 */
export function RequireOrg() {
  const { session, loading, organizationId, roles } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  if (!organizationId && roles.length === 0) {
    return <Navigate to="/setup-organization" replace />;
  }

  return <Outlet />;
}
