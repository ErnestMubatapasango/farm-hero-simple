import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveOrg } from "@/hooks/useActiveOrg";
import { OrgSwitcher, SelectOrgNotice } from "@/components/OrgSwitcher";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Mail, Clock, ShieldCheck, Pencil, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  assignableRolesFor,
  canManageRoles,
  canSeeAllOrganizations,
  primaryRole,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AppRole,
  PERMISSIONS,
} from "@/lib/permissions";

interface MemberRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  roles: AppRole[];
}

interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  memberCount: number;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function RoleBadge({ role }: { role: AppRole }) {
  const styles: Record<AppRole, string> = {
    developer: "bg-purple-500/10 text-purple-600 border-purple-500/30",
    super_admin: "bg-primary/10 text-primary border-primary/30",
    admin: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    enumerator: "bg-muted text-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export default function AdminUsers() {
  const { roles, session } = useAuth();
  const {
    activeOrganizationId: activeOrgId,
    activeOrganizationName,
    needsOrgSelection,
  } = useActiveOrg();
  const { toast } = useToast();
  const isDeveloper = canSeeAllOrganizations(roles);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole | null>(null);
  const [saving, setSaving] = useState(false);

  const { can } = usePermissions();
  const canManage = canManageRoles(roles) || can(PERMISSIONS.teamManageRoles);

  const loadMembers = useCallback(
    async (orgId: string) => {
      setLoading(true);
      const { data, error } = await supabase.rpc("list_org_members", { _org_id: orgId });
      if (error) {
        toast({ title: "Failed to load users", description: error.message, variant: "destructive" });
        setMembers([]);
      } else {
        setMembers((data as MemberRow[]) || []);
      }
      setLoading(false);
    },
    [toast]
  );

  useEffect(() => {
    if (!activeOrgId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    loadMembers(activeOrgId);
  }, [activeOrgId, loadMembers]);

  const openEdit = (m: MemberRow) => {
    setEditing(m);
    setSelectedRole(primaryRole(m.roles));
  };

  const saveRole = async () => {
    if (!editing || !activeOrgId || !selectedRole) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_user_roles", {
      _user_id: editing.user_id,
      _org_id: activeOrgId,
      _roles: [selectedRole],
    });
    if (error) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
      setEditing(null);
      await loadMembers(activeOrgId);
    }
    setSaving(false);
  };

  const editableRoles = editing ? assignableRolesFor(roles, editing.roles) : [];

  if (loading) {
    return <GerminatingLogo fullScreen={false} message="Loading team members..." />;
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isDeveloper && activeOrganizationName ? activeOrganizationName : "Users"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {members.length} user{members.length === 1 ? "" : "s"}
            {isDeveloper ? " in this organization." : " in your organization."}
            {!canManage && " Role changes are limited to super admins."}
          </p>
        </div>
        <OrgSwitcher />
      </div>

      {needsOrgSelection && <SelectOrgNotice what="users" />}

      <div className="kyf-card-flat divide-y divide-border">
        {members.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No users found.</p>
        ) : (
          members.map((m) => {
            const isSelf = m.user_id === session?.user?.id;
            const role = primaryRole(m.roles);
            const canEditThis = canManage && assignableRolesFor(roles, m.roles).length > 0;
            return (
              <div
                key={m.user_id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.full_name || "Unnamed"}
                    </p>
                    {isSelf && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  {m.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3" /> {m.email}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" /> Last active {relativeTime(m.last_sign_in_at)}
                    {m.created_at && (
                      <span className="ml-2">
                        · Joined {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={role} />
                </div>

                {canEditThis && (
                  <button
                    onClick={() => openEdit(m)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit role
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit-role dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Edit role
            </DialogTitle>
            <DialogDescription>
              {editing?.full_name || editing?.email || "User"} — a user holds exactly one role in an
              organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {editableRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Only a platform developer can change this user's role.
              </p>
            ) : (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Role</Label>
                <Select
                  value={selectedRole ?? undefined}
                  onValueChange={(v) => setSelectedRole(v as AppRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRole && (
                  <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[selectedRole]}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setEditing(null)}
              disabled={saving}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveRole}
              disabled={saving || editableRoles.length === 0 || !selectedRole}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save role"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
