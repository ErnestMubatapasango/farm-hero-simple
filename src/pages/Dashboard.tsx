import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Sprout,
  ChevronRight,
  Loader2,
  Users,
  UserPlus,
  Clock,
  CheckCircle,
  XCircle,
  Send,
} from "lucide-react";

interface Stats {
  totalFarmers: number;
  pendingFarmers: number;
  verifiedFarmers: number;
  rejectedFarmers: number;
  totalUsers: number;
  pendingInvitations: number;
}

export default function Dashboard() {
  const { session, roles, loading, organizationId, hasAnyRole, hasRole } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const isAdmin = hasAnyRole(["admin", "super_admin", "developer"]);

  useEffect(() => {
    if (!session?.user?.id) return;

    async function loadStats() {
      setLoadingStats(true);

      // Farmers
      let farmersQuery = supabase.from("farmers").select("status");
      if (!hasRole("developer") && organizationId) {
        farmersQuery = farmersQuery.eq("organization_id", organizationId);
      }
      const enumeratorOnly =
        hasRole("enumerator") && !isAdmin;
      if (enumeratorOnly && session?.user?.id) {
        farmersQuery = farmersQuery.eq("enrolled_by", session.user.id);
      }
      const { data: farmersData } = await farmersQuery;
      const farmers = farmersData || [];

      // Users (profiles)
      let usersCount = 0;
      if (isAdmin) {
        let usersQuery = supabase.from("profiles").select("user_id", { count: "exact", head: true });
        if (!hasRole("developer") && organizationId) {
          usersQuery = usersQuery.eq("organization_id", organizationId);
        }
        const { count } = await usersQuery;
        usersCount = count || 0;
      }

      // Invitations
      let pendingInvites = 0;
      if (isAdmin) {
        let invQuery = supabase.from("invitations").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (!hasRole("developer") && organizationId) {
          invQuery = invQuery.eq("organization_id", organizationId);
        }
        const { count } = await invQuery;
        pendingInvites = count || 0;
      }

      setStats({
        totalFarmers: farmers.length,
        pendingFarmers: farmers.filter((f) => f.status === "submitted").length,
        verifiedFarmers: farmers.filter((f) => f.status === "verified").length,
        rejectedFarmers: farmers.filter((f) => f.status === "rejected").length,
        totalUsers: usersCount,
        pendingInvitations: pendingInvites,
      });
      setLoadingStats(false);
    }
    loadStats();
  }, [session, organizationId, hasRole, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const email = session?.user?.email || "User";
  const roleLabel = roles.length > 0 ? roles.map((r) => r.replace("_", " ")).join(", ") : "No role assigned";

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground leading-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">{email}</p>
      </div>

      {/* Stats cards */}
      {loadingStats ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Farmers"
            value={stats.totalFarmers}
            icon={Sprout}
            color="text-primary"
            bgColor="bg-primary/10"
          />
          <StatCard
            label="Pending Review"
            value={stats.pendingFarmers}
            icon={Clock}
            color="text-yellow-500"
            bgColor="bg-yellow-500/10"
          />
          <StatCard
            label="Verified"
            value={stats.verifiedFarmers}
            icon={CheckCircle}
            color="text-green-500"
            bgColor="bg-green-500/10"
          />
          {isAdmin && (
            <StatCard
              label="Team Members"
              value={stats.totalUsers}
              icon={Users}
              color="text-blue-500"
              bgColor="bg-blue-500/10"
            />
          )}
        </div>
      ) : null}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hasAnyRole(["enumerator", "admin", "super_admin", "developer"]) && (
            <QuickAction
              to="/onboarding"
              icon={UserPlus}
              title="Onboard Farmer"
              description="Register a new farmer"
            />
          )}
          {isAdmin && (
            <QuickAction
              to="/admin/farmers"
              icon={Sprout}
              title="Review Farmers"
              description={`${stats?.pendingFarmers || 0} pending review`}
            />
          )}
          {hasRole("enumerator") && !isAdmin && (
            <QuickAction
              to="/admin/farmers"
              icon={Sprout}
              title="My Farmers"
              description={`${stats?.totalFarmers || 0} you've onboarded`}
            />
          )}
          {hasAnyRole(["super_admin", "developer"]) && (
            <QuickAction
              to="/admin/invitations"
              icon={Send}
              title="Invite Users"
              description={`${stats?.pendingInvitations || 0} pending invitations`}
            />
          )}
        </div>
      </div>

      {/* Role info */}
      <div className="kyf-card-flat p-5 kyf-slide-up" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sprout className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your Role</p>
            <p className="text-sm font-semibold text-foreground capitalize">{roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="kyf-card p-4 kyf-slide-up">
      <div className="flex items-center gap-3 mb-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="kyf-card p-4 hover:border-primary/30 transition-colors group flex items-center gap-3"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
        <Icon className="h-4.5 w-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
