import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin } from "@/lib/permissions";
import { GerminatingLogo } from "@/components/GerminatingLogo";

export function AdminRoute() {
  const { roles, loading, profileLoading } = useAuth();

  if (loading || profileLoading) {
    return <GerminatingLogo message="Checking permissions..." />;
  }


  if (!isOrgAdmin(roles)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
