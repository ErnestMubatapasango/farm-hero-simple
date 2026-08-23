import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isPlatformDeveloper } from "@/lib/permissions";

const STORAGE_KEY = "kyf.dev.activeOrg";

export interface OrgOption {
  id: string;
  name: string;
  memberCount: number;
  farmerCount: number;
}

interface ActiveOrgContextType {
  /** Organization every section should read from. */
  activeOrganizationId: string | null;
  /** Name of the active organization, when known. */
  activeOrganizationName: string | null;
  /** The organization the signed-in user actually belongs to (writes target this). */
  profileOrganizationId: string | null;
  /** Platform developer: may switch between organizations. */
  isDeveloper: boolean;
  /** Developer that has not picked an organization yet. */
  needsOrgSelection: boolean;
  organizations: OrgOption[];
  loadingOrganizations: boolean;
  setActiveOrganization: (id: string | null) => void;
}

const ActiveOrgContext = createContext<ActiveOrgContextType | null>(null);

export function ActiveOrgProvider({ children }: { children: React.ReactNode }) {
  const { roles, organizationId } = useAuth();
  const isDeveloper = isPlatformDeveloper(roles);

  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Developers browse every organization on the platform.
  useEffect(() => {
    if (!isDeveloper) {
      setOrganizations([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingOrganizations(true);
      const [orgRes, profileRes, farmerRes] = await Promise.all([
        supabase.from("organizations").select("id, name").order("name"),
        supabase.from("profiles").select("organization_id"),
        supabase.from("farmers").select("organization_id"),
      ]);
      if (cancelled) return;
      const members = new Map<string, number>();
      (profileRes.data ?? []).forEach((p) => {
        if (p.organization_id) members.set(p.organization_id, (members.get(p.organization_id) ?? 0) + 1);
      });
      const farmers = new Map<string, number>();
      (farmerRes.data ?? []).forEach((f) => {
        if (f.organization_id) farmers.set(f.organization_id, (farmers.get(f.organization_id) ?? 0) + 1);
      });
      setOrganizations(
        (orgRes.data ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          memberCount: members.get(o.id) ?? 0,
          farmerCount: farmers.get(o.id) ?? 0,
        })),
      );
      setLoadingOrganizations(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDeveloper]);

  const setActiveOrganization = useCallback((id: string | null) => {
    setSelectedId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — selection stays in memory only */
    }
  }, []);

  // Drop a stale stored selection once the org list is known.
  useEffect(() => {
    if (!isDeveloper || organizations.length === 0 || !selectedId) return;
    if (!organizations.some((o) => o.id === selectedId)) setActiveOrganization(null);
  }, [isDeveloper, organizations, selectedId, setActiveOrganization]);

  const activeOrganizationId = isDeveloper ? selectedId ?? organizationId : organizationId;

  const [ownOrgName, setOwnOrgName] = useState<string | null>(null);
  useEffect(() => {
    if (isDeveloper || !activeOrganizationId) {
      setOwnOrgName(null);
      return;
    }
    supabase
      .from("organizations")
      .select("name")
      .eq("id", activeOrganizationId)
      .maybeSingle()
      .then(({ data }) => setOwnOrgName(data?.name ?? null));
  }, [isDeveloper, activeOrganizationId]);

  const value = useMemo<ActiveOrgContextType>(() => {
    const activeOrganizationName = isDeveloper
      ? organizations.find((o) => o.id === activeOrganizationId)?.name ?? null
      : ownOrgName;
    return {
      activeOrganizationId,
      activeOrganizationName,
      profileOrganizationId: organizationId,
      isDeveloper,
      needsOrgSelection: isDeveloper && !activeOrganizationId,
      organizations,
      loadingOrganizations,
      setActiveOrganization,
    };
  }, [
    activeOrganizationId,
    ownOrgName,
    organizationId,
    isDeveloper,
    organizations,
    loadingOrganizations,
    setActiveOrganization,
  ]);

  return <ActiveOrgContext.Provider value={value}>{children}</ActiveOrgContext.Provider>;
}

export function useActiveOrg() {
  const ctx = useContext(ActiveOrgContext);
  if (!ctx) throw new Error("useActiveOrg must be used within ActiveOrgProvider");
  return ctx;
}
