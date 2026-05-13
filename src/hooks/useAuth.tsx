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

  const checkRevoked = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("invitations")
      .select("id")
      .eq("invited_user_id", userId)
      .eq("status", "revoked")
      .limit(1);
    if (data && data.length > 0) {
      await supabase.auth.signOut();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user?.id) {
          const uid = session.user.id;
          setTimeout(async () => {
            const revoked = await checkRevoked(uid);
            if (!revoked) await fetchRolesAndOrg(uid);
          }, 0);
        } else {
          setRoles([]);
          setOrganizationId(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        const revoked = await checkRevoked(session.user.id);
        if (!revoked) await fetchRolesAndOrg(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRolesAndOrg, checkRevoked]);

  // Realtime: sign out immediately if this user's invitation gets revoked
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const channel = supabase
      .channel(`invite-revoke-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invitations",
          filter: `invited_user_id=eq.${userId}`,
        },
        async (payload) => {
          const newRow = payload.new as { status?: string };
          if (newRow?.status === "revoked") {
            await supabase.auth.signOut();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

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
