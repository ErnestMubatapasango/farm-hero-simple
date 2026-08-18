import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { syncManager } from "@/lib/offline/syncManager";
import { completePendingOrg } from "@/lib/pendingOrg";
import {
  IDLE_TIMEOUT_MS,
  clearLastActivity,
  markIdleLogout,
  readLastActivity,
  writeLastActivity,
} from "@/lib/idle";

type AppRole = "developer" | "super_admin" | "admin" | "enumerator";

/** Hard cap on the boot loader: never block the UI longer than this. */
const BOOT_TIMEOUT_MS = 8000;

interface AuthContextType {
  session: Session | null;
  /** True only until the session itself is known. */
  loading: boolean;
  /** True while roles/organization are being resolved for the current user. */
  profileLoading: boolean;
  /** Set when roles/organization could not be loaded. */
  error: string | null;
  roles: AppRole[];
  organizationId: string | null;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  refreshRoles: () => Promise<void>;
  /** Retry a failed roles/organization load. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const resolvedForRef = useRef<string | null>(null);

  const fetchRolesAndOrg = useCallback(async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (!mountedRef.current) return;
    setRoles((rolesRes.data || []).map((r) => r.role as AppRole));
    setOrganizationId(profileRes.data?.organization_id || null);
  }, []);

  // A user is treated as revoked only if they have a historical revoked
  // invitation AND currently hold no active roles.
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

  const expiredByInactivity = useCallback(async (uid: string) => {
    const last = readLastActivity(uid);
    if (last === null) {
      writeLastActivity(uid);
      return false;
    }
    if (Date.now() - last < IDLE_TIMEOUT_MS) return false;
    markIdleLogout();
    clearLastActivity(uid);
    await supabase.auth.signOut();
    return true;
  }, []);

  /**
   * Resolves roles/organization for a user. Always runs OUTSIDE the Supabase
   * auth callback so it can never deadlock on the client's auth lock, and
   * always clears its loading flag in `finally` so the UI can render.
   */
  const resolveProfile = useCallback(
    async (uid: string) => {
      setProfileLoading(true);
      setError(null);
      try {
        if (await expiredByInactivity(uid)) return;
        if (await checkRevoked(uid)) return;
        await fetchRolesAndOrg(uid);
      } catch (err) {
        console.error("[auth] Failed to resolve roles/organization:", err);
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Could not load your account.");
        }
      } finally {
        if (mountedRef.current) setProfileLoading(false);
      }

      // Non-blocking fallback: complete a stashed create-org intent after the
      // UI has already rendered.
      void (async () => {
        try {
          const result = await completePendingOrg(uid);
          if (result.created) await fetchRolesAndOrg(uid);
          else if (result.error) console.error("Pending org completion failed:", result.error);
        } catch (err) {
          console.error("Pending org completion failed:", err);
        }
      })();
    },
    [expiredByInactivity, checkRevoked, fetchRolesAndOrg]
  );

  const refreshRoles = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      await fetchRolesAndOrg(uid);
      setError(null);
    } catch (err) {
      console.error("[auth] refreshRoles failed:", err);
    }
  }, [session, fetchRolesAndOrg]);

  const retry = useCallback(() => {
    const uid = session?.user?.id;
    if (uid) void resolveProfile(uid);
  }, [session, resolveProfile]);

  useEffect(() => {
    mountedRef.current = true;

    // Safety net: never leave the app on the boot loader forever.
    const bootTimeout = window.setTimeout(() => {
      if (mountedRef.current) {
        setLoading(false);
        setProfileLoading(false);
      }
    }, BOOT_TIMEOUT_MS);

    // IMPORTANT: this callback stays synchronous. Awaiting Supabase calls here
    // holds the client's auth lock and can hang the app on the loader.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return;
      setSession(nextSession);
      setLoading(false);

      const uid = nextSession?.user?.id ?? null;
      if (!uid) {
        resolvedForRef.current = null;
        setRoles([]);
        setOrganizationId(null);
        setProfileLoading(false);
        setError(null);
        return;
      }

      // Background events (token refresh / tab focus) must not re-block the UI.
      const isBackgroundEvent = event === "TOKEN_REFRESHED" || event === "USER_UPDATED";
      if (isBackgroundEvent && resolvedForRef.current === uid) {
        setTimeout(() => {
          void fetchRolesAndOrg(uid).catch((err) =>
            console.error("[auth] background role refresh failed:", err)
          );
        }, 0);
        return;
      }

      if (resolvedForRef.current === uid) return;
      resolvedForRef.current = uid;
      // Defer out of the auth callback.
      setTimeout(() => void resolveProfile(uid), 0);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!mountedRef.current) return;
        setSession(initialSession);
        const uid = initialSession?.user?.id ?? null;
        if (!uid) {
          setProfileLoading(false);
          return;
        }
        if (resolvedForRef.current !== uid) {
          resolvedForRef.current = uid;
          void resolveProfile(uid);
        }
      })
      .catch((err) => {
        console.error("[auth] getSession failed:", err);
        if (mountedRef.current) setProfileLoading(false);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      window.clearTimeout(bootTimeout);
      subscription.unsubscribe();
    };
  }, [resolveProfile, fetchRolesAndOrg]);

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
    <AuthContext.Provider
      value={{
        session,
        loading,
        profileLoading,
        error,
        roles,
        organizationId,
        hasRole,
        hasAnyRole,
        refreshRoles,
        retry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
