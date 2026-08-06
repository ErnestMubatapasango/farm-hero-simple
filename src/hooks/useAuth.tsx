import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { syncManager } from "@/lib/offline/syncManager";
import { completePendingOrg } from "@/lib/pendingOrg";

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

  // A user is treated as revoked only if they have a historical revoked
  // invitation AND currently hold no active roles. This lets re-invited users
  // regain access (their roles are re-inserted on acceptance) and avoids
  // signing out brand-new sign-ups mid-onboarding.
  const checkRevoked = useCallback(async (userId: string) => {
    const [rolesRes, revokedRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1),
      supabase
        .from("invitations")
        .select("id")
        .eq("invited_user_id", userId)
        .eq("status", "revoked")
        .limit(1),
    ]);
    const hasRoles = (rolesRes.data?.length ?? 0) > 0;
    const wasRevoked = (revokedRes.data?.length ?? 0) > 0;
    if (wasRevoked && !hasRoles) {
      await supabase.auth.signOut();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    const finalizeSession = async (uid: string) => {
      const revoked = await checkRevoked(uid);
      if (revoked) return;
      await fetchRolesAndOrg(uid);
      // Fallback: if a create-org intent was stashed at signup and the
      // server-side trigger didn't create the org, complete it now.
      const result = await completePendingOrg(uid);
      if (result.created) await fetchRolesAndOrg(uid);
      else if (result.error) console.error("Pending org completion failed:", result.error);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user?.id) {
          const uid = session.user.id;
          setTimeout(() => { finalizeSession(uid); }, 0);
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
        await finalizeSession(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRolesAndOrg, checkRevoked]);

  // Start/stop offline sync manager when auth state changes
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) {
      syncManager.start(uid);
    } else {
      syncManager.stop();
    }
  }, [session?.user?.id]);

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
