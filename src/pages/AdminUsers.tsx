import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface UserRow {
  user_id: string;
  full_name: string | null;
  organization_id: string | null;
  created_at: string | null;
}

export default function AdminUsers() {
  const { organizationId, hasRole } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase.from("profiles").select("user_id, full_name, organization_id, created_at");
      if (!hasRole("developer")) {
        query = query.eq("organization_id", organizationId);
      }
      const { data } = await query;
      setUsers(data || []);
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
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">{users.length} user(s) in your organization.</p>
      </div>
      <div className="kyf-card-flat divide-y divide-border">
        {users.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No users found.</p>
        ) : (
          users.map((u) => (
            <div key={u.user_id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">{u.full_name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
