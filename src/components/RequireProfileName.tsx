import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { GerminatingLogo } from "@/components/GerminatingLogo";

/**
 * Blocks the app for signed-in users whose profile has no name yet, sending
 * them to the "Complete your profile" screen first.
 */
export function RequireProfileName() {
  const { loading, profileLoading, needsProfileName } = useAuth();

  if (loading || profileLoading) return <GerminatingLogo message="Preparing your farm..." />;
  if (needsProfileName) return <Navigate to="/complete-profile" replace />;

  return <Outlet />;
}
