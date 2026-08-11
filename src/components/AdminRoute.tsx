import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin } from "@/lib/permissions";

export function AdminRoute() {
  const { roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isOrgAdmin(roles)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
