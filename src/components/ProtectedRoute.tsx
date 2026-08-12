import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { IdleTimeoutDialog } from "@/components/IdleTimeoutDialog";
import { GerminatingLogo } from "@/components/GerminatingLogo";

export function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <GerminatingLogo message="Growing your workspace..." />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <IdleTimeoutDialog />
      <Outlet />
    </>
  );
}
