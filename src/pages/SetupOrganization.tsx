import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Sprout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { readPendingOrg, clearPendingOrg } from "@/lib/pendingOrg";

export default function SetupOrganization() {
  const { session, loading: authLoading, organizationId, roles, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const pending = readPendingOrg();

  const [orgName, setOrgName] = useState(pending?.name ?? "");
  const [fullName, setFullName] = useState(pending?.full_name ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (authLoading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (organizationId || roles.length > 0) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { error: rpcError } = await supabase.rpc("create_organization", {
      _name: orgName,
      _slug: slug,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    if (fullName.trim()) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("user_id", session.user.id);
    }

    clearPendingOrg();
    await refreshRoles();
    navigate("/", { replace: true });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sprout className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Finish setting up</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't linked to an organization yet. Create one to continue —
            you'll become its super admin and can invite admins and enumerators from
            there.
          </p>
        </div>


        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Organization Name</label>
            <Input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Farms Ltd"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Full Name</label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>

          <button
            type="button"
            onClick={async () => {
              clearPendingOrg();
              await supabase.auth.signOut();
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
