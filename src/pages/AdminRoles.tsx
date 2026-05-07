import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface RoleRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string | null;
  profiles?: { full_name: string | null } | null;
}

export default function AdminRoles() {
  const { organizationId, hasRole } = useAuth();
  const [roleEntries, setRoleEntries] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase.from("user_roles").select("id, user_id, role, created_at");
      if (!hasRole("developer")) {
        query = query.eq("organization_id", organizationId);
      }
      const { data } = await query;
      setRoleEntries((data as RoleRow[]) || []);
      setLoading(false);
    }
    load();
  }, [organizationId, hasRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
        <p className="text-muted-foreground mt-1">View and manage user roles.</p>
      </div>
      <div className="kyf-card-flat divide-y divide-border">
        {roleEntries.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No roles assigned yet.</p>
        ) : (
          roleEntries.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-foreground capitalize">{r.role.replace("_", " ")}</p>
                <p className="text-xs text-muted-foreground">User: {r.user_id.slice(0, 8)}…</p>
              </div>
              <span className="text-xs bg-muted px-2.5 py-0.5 rounded-full font-medium">{r.role}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
