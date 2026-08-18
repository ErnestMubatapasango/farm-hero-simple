import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PermissionKey } from "@/lib/permissions";

interface PermissionsContextType {
  /** Effective permission keys for the signed-in user in their organization. */
  permissions: Set<string>;
  loading: boolean;
  can: (key: PermissionKey) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { session, roles, organizationId } = useAuth();
  const userId = session?.user?.id;
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("my_permissions");
    if (error) {
      console.error("Failed to load permissions:", error.message);
      setPermissions(new Set());
    } else {
      setPermissions(new Set((data || []).map((r) => r.permission_key)));
    }
    setLoading(false);
  }, [userId]);

  // Reload whenever the identity, roles or organization changes.
  useEffect(() => {
    load();
  }, [load, organizationId, roles.join(",")]);

  const can = useCallback((key: PermissionKey) => permissions.has(key), [permissions]);

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, refresh: load }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
