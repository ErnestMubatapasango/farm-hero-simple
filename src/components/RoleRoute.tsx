import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "developer" | "super_admin" | "admin" | "enumerator";

interface RoleRouteProps {
  allow: AppRole[];
  redirectTo?: string;
}

/**
 * Route guard that only allows users holding at least one of the listed roles.
 * Use for pages tighter than the generic AdminRoute (e.g. super_admin-only).
 */
export function RoleRoute({ allow, redirectTo = "/" }: RoleRouteProps) {
  const { hasAnyRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasAnyRole(allow)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
