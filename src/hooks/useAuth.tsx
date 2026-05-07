import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type AppRole = "developer" | "super_admin" | "admin" | "enumerator";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  organizationId: string | null;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const fetchRolesAndOrg = useCallback(async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle(),
    ]);
    setRoles((rolesRes.data || []).map((r) => r.role));
    setOrganizationId(profileRes.data?.organization_id || null);
  }, []);

  const refreshRoles = useCallback(async () => {
    if (session?.user?.id) {
      await fetchRolesAndOrg(session.user.id);
    }
  }, [session, fetchRolesAndOrg]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user?.id) {
          setTimeout(() => fetchRolesAndOrg(session.user.id), 0);
        } else {
          setRoles([]);
          setOrganizationId(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        fetchRolesAndOrg(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchRolesAndOrg]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const hasAnyRole = useCallback((r: AppRole[]) => r.some((role) => roles.includes(role)), [roles]);

  return (
    <AuthContext.Provider value={{ session, loading, roles, organizationId, hasRole, hasAnyRole, refreshRoles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
