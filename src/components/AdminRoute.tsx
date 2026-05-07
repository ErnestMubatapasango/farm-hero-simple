import { Navigate, Outlet } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";

export function AdminRoute() {
  const { session } = useAuth();
  const { isAdmin, loading } = useAdminRole();

  if (!session) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
