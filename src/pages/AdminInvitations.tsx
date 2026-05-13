import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Clock, CheckCircle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  token: string;
  created_at: string | null;
  accepted_at: string | null;
}

export default function AdminInvitations() {
  const { organizationId, hasRole, session } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("enumerator");

  const isSuperAdmin = hasRole("super_admin") || hasRole("developer");

  const loadInvitations = async () => {
    setLoading(true);
    let query = supabase.from("invitations").select("*").order("created_at", { ascending: false });
    if (!hasRole("developer")) {
      query = query.eq("organization_id", organizationId);
    }
    const { data } = await query;
    setInvitations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadInvitations();
  }, [organizationId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !session?.user?.id) return;
    setSending(true);

    const { error } = await supabase.from("invitations").insert({
      organization_id: organizationId,
      email,
      role: role as any,
      invited_by: session.user.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Invitation sent", description: `Invited ${email} as ${role.replace("_", " ")}` });
      setEmail("");
      setRole("enumerator");
      setDialogOpen(false);
      loadInvitations();
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (!error) {
      toast({ title: "Invitation removed" });
      loadInvitations();
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/login?invite=${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: "Invite link copied to clipboard" });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "accepted": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "expired": return <XCircle className="h-4 w-4 text-destructive" />;
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

      <div className="kyf-card-flat divide-y divide-border">
        {invitations.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No invitations yet.</p>
        ) : (
          invitations.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                {statusIcon(inv.status)}
                <div>
                  <p className="text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {inv.role.replace("_", " ")} · {inv.status}
                    {inv.created_at && ` · ${new Date(inv.created_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {inv.status === "pending" && (
                  <button
                    onClick={() => copyInviteLink(inv.token)}
                    className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Copy invite link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete invitation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
