import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Clock, ShieldCheck, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type AppRole = "developer" | "super_admin" | "admin" | "enumerator";

const ASSIGNABLE_ROLES: { key: AppRole; label: string; description: string }[] = [
  { key: "super_admin", label: "Super Admin", description: "Full org control, can manage users & roles." },
  { key: "admin", label: "Admin", description: "Verify farmers, view all data." },
  { key: "enumerator", label: "Enumerator", description: "Enroll farmers and edit their own drafts." },
];

interface MemberRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  roles: AppRole[];
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
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${styles[role]}`}
    >
      {role.replace("_", " ")}
    </span>
  );
}

export default function AdminUsers() {
  const { organizationId, hasAnyRole, session } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);

  const canManage = hasAnyRole(["super_admin", "developer"]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("list_org_members", {
      _org_id: organizationId,
    });
    if (error) {
      toast({ title: "Failed to load users", description: error.message, variant: "destructive" });
      setMembers([]);
    } else {
      setMembers((data as MemberRow[]) || []);
    }
    setLoading(false);
  }, [organizationId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (m: MemberRow) => {
    setEditing(m);
    setSelectedRoles(m.roles.filter((r) => r !== "developer"));
  };

  const toggleRole = (role: AppRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const saveRoles = async () => {
    if (!editing || !organizationId) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_user_roles", {
      _user_id: editing.user_id,
      _org_id: organizationId,
      _roles: selectedRoles,
    });
    if (error) {
      toast({ title: "Failed to update roles", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Roles updated" });
      setEditing(null);
      await load();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">
          {members.length} user{members.length === 1 ? "" : "s"} in your organization.
        </p>
      </div>

      <div className="kyf-card-flat divide-y divide-border">
        {members.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No users found.</p>
        ) : (
          members.map((m) => {
            const isSelf = m.user_id === session?.user?.id;
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
                  {m.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No roles</span>
                  ) : (
                    m.roles.map((r) => <RoleBadge key={r} role={r} />)
                  )}
                </div>

                {canManage && (
                  <button
                    onClick={() => openEdit(m)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit roles
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit-roles dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Edit roles
            </DialogTitle>
            <DialogDescription>
              {editing?.full_name || editing?.email || "User"} — select which roles this user
              should have in your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {ASSIGNABLE_ROLES.map((r) => (
              <label
                key={r.key}
                className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedRoles.includes(r.key)}
                  onCheckedChange={() => toggleRole(r.key)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label className="text-sm font-medium cursor-pointer">{r.label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                </div>
              </label>
            ))}
            {editing?.roles.includes("developer") && (
              <p className="text-xs text-muted-foreground italic">
                This user has the developer role — it isn't editable here.
              </p>
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
              onClick={saveRoles}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save roles"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
