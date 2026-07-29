import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Clock, CheckCircle, XCircle, RefreshCw, Trash2, Ban, AlertTriangle, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/EmptyState";
import { relativeTime, daysSince } from "@/lib/relative-time";

const STALE_DAYS = 7;
type FilterKey = "all" | "pending" | "accepted" | "revoked" | "failed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string | null;
  accepted_at: string | null;
  invited_user_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  last_error: string | null;
}

export default function AdminInvitations() {
  const { organizationId, hasRole, session } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("enumerator");

  // Revoke confirmation state
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [revokePassword, setRevokePassword] = useState("");
  const [revokeError, setRevokeError] = useState("");
  const [revoking, setRevoking] = useState(false);

  const [filter, setFilter] = useState<FilterKey>("all");

  const isSuperAdmin = hasRole("super_admin") || hasRole("developer");

  const loadInvitations = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    let query = supabase
      .from("invitations")
      .select("id, email, role, status, created_at, accepted_at, invited_user_id, revoked_at, revoked_by, last_error")
      .order("created_at", { ascending: false });
    if (!hasRole("developer") && organizationId) {
      query = query.eq("organization_id", organizationId);
    }
    const { data } = await query;
    const invs = (data || []) as Invitation[];
    setInvitations(invs);

    const ids = Array.from(
      new Set(
        invs.flatMap((i) => [i.invited_user_id, i.revoked_by]).filter((v): v is string => !!v)
      )
    );
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const map: Record<string, string | null> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = p.full_name;
      });
      setNameMap(map);
    } else {
      setNameMap({});
    }
    setLoading(false);
  }, [organizationId, hasRole]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadInvitations(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadInvitations]);

  useEffect(() => {
    const channel = supabase
      .channel("invitations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invitations" },
        () => loadInvitations(false)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInvitations]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadInvitations(false);
    setRefreshing(false);
  };

  const callInviteFn = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("invite-user", { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setSending(true);
    try {
      await callInviteFn({ action: "invite", email, role });
      toast({ title: "Invitation sent", description: `Invited ${email} as ${role.replace("_", " ")}` });
      setEmail("");
      setRole("enumerator");
      setDialogOpen(false);
      loadInvitations(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  const openRevokeDialog = (inv: Invitation) => {
    setRevokeTarget(inv);
    setRevokePassword("");
    setRevokeError("");
  };

  const closeRevokeDialog = () => {
    if (revoking) return;
    setRevokeTarget(null);
    setRevokePassword("");
    setRevokeError("");
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget || !session?.user?.email) return;
    setRevoking(true);
    setRevokeError("");
    // Re-authenticate the acting admin as a credential probe.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: revokePassword,
    });
    if (authErr) {
      setRevokeError("Incorrect password.");
      setRevoking(false);
      return;
    }
    try {
      await callInviteFn({ action: "revoke", invitation_id: revokeTarget.id });
      toast({
        title: revokeTarget.status === "accepted" ? "Access revoked" : "Invitation removed",
        description:
          revokeTarget.status === "accepted"
            ? "User can no longer sign in. Farmers they enrolled remain in your organization."
            : undefined,
      });
      setRevokeTarget(null);
      setRevokePassword("");
      loadInvitations(false);
    } catch (err: any) {
      setRevokeError(err.message);
    }
    setRevoking(false);
  };

  const handleResend = async (id: string) => {
    try {
      await callInviteFn({ action: "resend", invitation_id: id });
      toast({ title: "Invitation resent" });
      loadInvitations(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "accepted": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "expired": return <XCircle className="h-4 w-4 text-destructive" />;
      case "revoked": return <Ban className="h-4 w-4 text-muted-foreground" />;
      case "failed": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invitations</h1>
          <p className="text-muted-foreground mt-1">Invite admins and enumerators to your organization.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {isSuperAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-all">
                  <Send className="h-4 w-4" />
                  Invite User
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Role</label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="enumerator">Enumerator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Invitation"}
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {(() => {
        const counts = {
          all: invitations.length,
          pending: invitations.filter((i) => i.status === "pending").length,
          accepted: invitations.filter((i) => i.status === "accepted").length,
          failed: invitations.filter((i) => i.status === "failed").length,
          revoked: invitations.filter((i) => i.status === "revoked").length,
        };
        const tabs: { key: FilterKey; label: string }[] = [
          { key: "all", label: "All" },
          { key: "pending", label: "Pending" },
          { key: "accepted", label: "Accepted" },
          { key: "failed", label: "Failed" },
          { key: "revoked", label: "Revoked" },
        ];
        return (
          <div className="flex flex-wrap gap-1 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  filter === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-muted-foreground">{counts[t.key]}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <div className="kyf-card-flat divide-y divide-border">
        {(() => {
          const filtered = filter === "all" ? invitations : invitations.filter((i) => i.status === filter);
          if (filtered.length === 0) {
            return (
              <EmptyState
                icon={Inbox}
                title={filter === "all" ? "No invitations yet" : `No ${filter} invitations`}
                description={
                  isSuperAdmin && filter !== "revoked"
                    ? "Invite admins and enumerators using the button above."
                    : undefined
                }
              />
            );
          }
          return filtered.map((inv) => {
            const acceptedName = inv.invited_user_id ? nameMap[inv.invited_user_id] : null;
            const revokerName = inv.revoked_by ? nameMap[inv.revoked_by] : null;
            const isAccepted = inv.status === "accepted";
            const isRevoked = inv.status === "revoked";
            const isPending = inv.status === "pending";
            const stale = isPending && daysSince(inv.created_at) >= STALE_DAYS;
            return (
              <div key={inv.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{statusIcon(inv.status)}</div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{inv.email}</p>
                      {stale && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 text-yellow-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                          <AlertTriangle className="h-3 w-3" />
                          Stale · resend
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">
                      {inv.role.replace("_", " ")} · {inv.status}
                      {inv.created_at && ` · sent ${relativeTime(inv.created_at)}`}
                    </p>
                    {isAccepted && inv.accepted_at && (
                      <p className="text-xs text-green-600 mt-1 normal-case">
                        Accepted by {acceptedName || inv.email} · {relativeTime(inv.accepted_at)}
                      </p>
                    )}
                    {isRevoked && inv.revoked_at && (
                      <p className="text-xs text-muted-foreground mt-1 normal-case">
                        Access revoked {relativeTime(inv.revoked_at)}
                        {revokerName ? ` by ${revokerName}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isPending && isSuperAdmin && (
                    <button
                      onClick={() => handleResend(inv.id)}
                      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Resend invitation email"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}
                  {isSuperAdmin && !isRevoked && (
                    <button
                      onClick={() => openRevokeDialog(inv)}
                      className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title={isAccepted ? "Revoke access" : "Delete invitation"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>


      {/* Revoke confirmation with password re-auth */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && closeRevokeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {revokeTarget?.status === "accepted" ? "Revoke access" : "Delete invitation"}
            </DialogTitle>
          </DialogHeader>
          {revokeTarget && (
            <form onSubmit={handleConfirmRevoke} className="space-y-4 mt-2">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">{revokeTarget.email}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {revokeTarget.role.replace("_", " ")} · {revokeTarget.status}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {revokeTarget.status === "accepted"
                  ? "This user will lose access immediately. Farmers they enrolled will remain in your organization with their name preserved as the enroller."
                  : "This pending invitation will be deleted and the invite link will no longer work."}
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Confirm with your password
                </label>
                <Input
                  type="password"
                  value={revokePassword}
                  onChange={(e) => setRevokePassword(e.target.value)}
                  placeholder="Your password"
                  required
                  autoFocus
                />
                {revokeError && <p className="text-xs text-destructive">{revokeError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRevokeDialog}
                  disabled={revoking}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revoking || !revokePassword}
                  className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {revoking
                    ? "Working…"
                    : revokeTarget.status === "accepted"
                    ? "Revoke access"
                    : "Delete"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
