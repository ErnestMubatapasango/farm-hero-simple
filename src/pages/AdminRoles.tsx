import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveOrg } from "@/hooks/useActiveOrg";
import { usePermissions } from "@/hooks/usePermissions";
import {
  isPlatformDeveloper,
  MANAGEABLE_ROLES,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PermissionRow {
  key: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
}

const PLATFORM_SCOPE = "__platform__";

export default function AdminRoles() {
  const { roles } = useAuth();
  const { activeOrganizationId: organizationId } = useActiveOrg();
  const { can } = usePermissions();
  const { toast } = useToast();

  const isDeveloper = isPlatformDeveloper(roles);
  const canManage = can(PERMISSIONS.teamManagePermissions) || isDeveloper;

  const [catalog, setCatalog] = useState<PermissionRow[]>([]);
  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState<string>(organizationId ?? PLATFORM_SCOPE);
  const [activeRole, setActiveRole] = useState<AppRole>("admin");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const scopeOrgId = scope === PLATFORM_SCOPE ? null : scope;
  const editingPlatformDefaults = scopeOrgId === null;

  useEffect(() => {
    if (organizationId) setScope(organizationId);
  }, [isDeveloper, organizationId]);

  useEffect(() => {
    if (!isDeveloper) return;
    supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data }) => setOrgs(data ?? []));
  }, [isDeveloper]);

  const load = useCallback(async () => {
    setLoading(true);
    const [catRes, defRes] = await Promise.all([
      supabase.from("permissions").select("key, label, description, category, sort_order"),
      supabase.from("role_permission_defaults").select("role, permission_key, enabled"),
    ]);
    setCatalog((catRes.data as PermissionRow[]) ?? []);
    const defMap: Record<string, boolean> = {};
    (defRes.data ?? []).forEach((d) => {
      defMap[`${d.role}:${d.permission_key}`] = d.enabled;
    });
    setDefaults(defMap);

    const ovMap: Record<string, boolean> = {};
    if (scopeOrgId) {
      const { data } = await supabase
        .from("org_role_permissions")
        .select("role, permission_key, enabled")
        .eq("organization_id", scopeOrgId);
      (data ?? []).forEach((o) => {
        ovMap[`${o.role}:${o.permission_key}`] = o.enabled;
      });
    }
    setOverrides(ovMap);
    setLoading(false);
  }, [scopeOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PermissionRow[]>();
    [...catalog]
      .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order)
      .forEach((p) => {
        const list = byCategory.get(p.category) ?? [];
        list.push(p);
        byCategory.set(p.category, list);
      });
    return [...byCategory.entries()];
  }, [catalog]);

  /** Super admins may not change the super_admin row; only a developer can. */
  const roleEditable =
    canManage && (isDeveloper || (!editingPlatformDefaults && activeRole !== "super_admin"));

  const effective = (permKey: string) => {
    const k = `${activeRole}:${permKey}`;
    if (!editingPlatformDefaults && k in overrides) return overrides[k];
    return defaults[k] ?? false;
  };
  const isInherited = (permKey: string) =>
    !editingPlatformDefaults && !(`${activeRole}:${permKey}` in overrides);

  const toggle = async (permKey: string, next: boolean) => {
    const k = `${activeRole}:${permKey}`;
    setSavingKey(permKey);
    // Optimistic
    if (editingPlatformDefaults) setDefaults((prev) => ({ ...prev, [k]: next }));
    else setOverrides((prev) => ({ ...prev, [k]: next }));

    const { error } = await supabase.rpc("set_role_permission", {
      // Null means "platform defaults"; the generated types don't model that.
      _org_id: scopeOrgId as unknown as string,
      _role: activeRole,
      _permission_key: permKey,
      _enabled: next,
    });
    setSavingKey(null);

    if (error) {
      // Roll back
      if (editingPlatformDefaults) setDefaults((prev) => ({ ...prev, [k]: !next }));
      else
        setOverrides((prev) => {
          const copy = { ...prev };
          delete copy[k];
          return copy;
        });
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Permission enabled" : "Permission disabled" });
  };

  const resetRole = async () => {
    if (!scopeOrgId) return;
    setResetting(true);
    const { error } = await supabase.rpc("reset_role_permissions", {
      _org_id: scopeOrgId,
      _role: activeRole,
    });
    setResetting(false);
    if (error) {
      toast({ title: "Could not reset", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${ROLE_LABELS[activeRole]} reset to platform defaults` });
    load();
  };

  if (loading) {
    return <GerminatingLogo fullScreen={false} message="Loading permissions..." />;
  }

  const hasOverrides = Object.keys(overrides).some((k) => k.startsWith(`${activeRole}:`));

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
        <p className="text-muted-foreground mt-1">
          Choose what each role can do on the platform.
        </p>
      </div>

      {isDeveloper && (
        <div className="kyf-card-flat p-4 space-y-2">
          <label className="text-sm font-medium text-foreground">Applies to</label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PLATFORM_SCOPE}>Platform defaults (all organizations)</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {editingPlatformDefaults
              ? "Editing the baseline every organization inherits."
              : "Editing this organization's overrides."}
          </p>
        </div>
      )}

      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as AppRole)}>
        <TabsList className="w-full sm:w-auto">
          {MANAGEABLE_ROLES.map((r) => (
            <TabsTrigger key={r} value={r} className="flex-1 sm:flex-none">
              {ROLE_LABELS[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="kyf-card-flat p-5 space-y-1">
        <p className="text-sm font-semibold text-foreground">{ROLE_LABELS[activeRole]}</p>
        <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[activeRole]}</p>
        {!roleEditable && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            {activeRole === "super_admin" && canManage
              ? "Only a platform developer can change super admin permissions."
              : "Read-only. You do not have permission to change these settings."}
          </p>
        )}
      </div>

      {grouped.map(([category, perms]) => (
        <div key={category} className="kyf-card-flat divide-y divide-border">
          <div className="px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </p>
          </div>
          {perms.map((p) => (
            <div key={p.key} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{p.label}</p>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                )}
                {isInherited(p.key) && (
                  <p className="text-[11px] text-muted-foreground mt-1">Inherited from platform default</p>
                )}
              </div>
              <Switch
                checked={effective(p.key)}
                disabled={!roleEditable || savingKey === p.key}
                onCheckedChange={(next) => toggle(p.key, next)}
                aria-label={p.label}
              />
            </div>
          ))}
        </div>
      ))}

      {roleEditable && !editingPlatformDefaults && hasOverrides && (
        <Button variant="outline" onClick={resetRole} disabled={resetting}>
          {resetting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Reset {ROLE_LABELS[activeRole]} to platform defaults
        </Button>
      )}
    </div>
  );
}
