import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Button } from "@/components/ui/button";

/**
 * Guards the app against orphaned accounts: a signed-in user with no
 * organization and no roles cannot do anything useful, so send them to the
 * setup screen to finish creating their organization.
 */
export function RequireOrg() {
  const { session, loading, profileLoading, error, organizationId, roles, retry } = useAuth();

  if (loading || profileLoading) return <GerminatingLogo message="Preparing your farm..." />;
  if (!session) return <Navigate to="/login" replace />;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <p className="font-medium">We couldn't load your account</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={retry}>Try again</Button>
      </div>
    );
  }

  if (!organizationId && roles.length === 0) {
    return <Navigate to="/setup-organization" replace />;
  }

  return <Outlet />;
}
