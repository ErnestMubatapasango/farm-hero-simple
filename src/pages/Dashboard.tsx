import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { relativeTime } from "@/lib/relative-time";
import { greeting } from "@/lib/greeting";
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
  Activity,
  Trophy,
  Building2,
} from "lucide-react";


interface Stats {
  totalFarmers: number;
  pendingFarmers: number;
  verifiedFarmers: number;
  rejectedFarmers: number;
  totalUsers: number;
  pendingInvitations: number;
}

interface ActivityRow {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  farmer_id: string;
  actor_id: string | null;
  farmer_name?: string;
  actor_name?: string;
}

interface LeaderRow {
  user_id: string;
  full_name: string;
  count: number;
}

export default function Dashboard() {
  const { session, roles, loading, organizationId, hasAnyRole, hasRole } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);

  const isAdmin = hasAnyRole(["admin", "super_admin", "developer"]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data }) => setMyName(data?.full_name ?? null));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!organizationId) {
      setOrgName(null);
      return;
    }
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? null));
  }, [organizationId]);


  useEffect(() => {
    if (!session?.user?.id) return;

    async function loadStats() {
      setLoadingStats(true);

      const scopeFarmers = (q: any) => {
        let out = q;
        if (!hasRole("developer") && organizationId) {
          out = out.eq("organization_id", organizationId);
        }
        const enumeratorOnly = hasRole("enumerator") && !isAdmin;
        if (enumeratorOnly && session?.user?.id) {
          out = out.eq("enrolled_by", session.user.id);
        }
        return out;
      };

      // Farmer counts — four head:true queries instead of loading every row
      const [totalRes, submittedRes, verifiedRes, rejectedRes] = await Promise.all([
        scopeFarmers(supabase.from("farmers").select("id", { count: "exact", head: true })),
        scopeFarmers(
          supabase.from("farmers").select("id", { count: "exact", head: true }).eq("status", "submitted")
        ),
        scopeFarmers(
          supabase.from("farmers").select("id", { count: "exact", head: true }).eq("status", "verified")
        ),
        scopeFarmers(
          supabase.from("farmers").select("id", { count: "exact", head: true }).eq("status", "rejected")
        ),
      ]);

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
        totalFarmers: totalRes.count || 0,
        pendingFarmers: submittedRes.count || 0,
        verifiedFarmers: verifiedRes.count || 0,
        rejectedFarmers: rejectedRes.count || 0,
        totalUsers: usersCount,
        pendingInvitations: pendingInvites,
      });

      // Leaderboard (admins only) — top 5 enumerators by farmer count.
      // Still row-based, but capped and only for admins. Migrate to grouped SQL RPC in Phase 3.
      if (isAdmin) {
        let leaderQuery = supabase.from("farmers").select("enrolled_by").not("enrolled_by", "is", null);
        if (!hasRole("developer") && organizationId) {
          leaderQuery = leaderQuery.eq("organization_id", organizationId);
        }
        const { data: leaderRows } = await leaderQuery;
        const counts = new Map<string, number>();
        (leaderRows || []).forEach((f: any) => {
          if (!f.enrolled_by) return;
          counts.set(f.enrolled_by, (counts.get(f.enrolled_by) || 0) + 1);
        });
        const topIds = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        if (topIds.length) {
          const ids = topIds.map(([id]) => id);
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", ids);
          const nameMap = new Map((profs || []).map((p: any) => [p.user_id, p.full_name]));
          setLeaderboard(
            topIds.map(([id, count]) => ({
              user_id: id,
              full_name: nameMap.get(id) || "Unknown",
              count,
            }))
          );
        } else {
          setLeaderboard([]);
        }
      }


      // Recent activity
      let actQuery = supabase
        .from("farmer_activity_log")
        .select("id, action, from_status, to_status, created_at, farmer_id, actor_id")
        .order("created_at", { ascending: false })
        .limit(8);
      if (!hasRole("developer") && organizationId) {
        actQuery = actQuery.eq("organization_id", organizationId);
      }
      const { data: actData } = await actQuery;
      const acts = (actData || []) as ActivityRow[];

      if (acts.length) {
        const farmerIds = Array.from(new Set(acts.map((a) => a.farmer_id)));
        const actorIds = Array.from(
          new Set(acts.map((a) => a.actor_id).filter((v): v is string => !!v))
        );
        const [{ data: fData }, { data: pData }] = await Promise.all([
          supabase.from("farmers").select("id, first_name, last_name").in("id", farmerIds),
          actorIds.length
            ? supabase.from("profiles").select("user_id, full_name").in("user_id", actorIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const fMap = new Map((fData || []).map((f: any) => [f.id, `${f.first_name} ${f.last_name}`]));
        const pMap = new Map((pData || []).map((p: any) => [p.user_id, p.full_name]));
        setActivity(
          acts.map((a) => ({
            ...a,
            farmer_name: fMap.get(a.farmer_id) || "Unknown farmer",
            actor_name: a.actor_id ? pMap.get(a.actor_id) || "Unknown" : "System",
          }))
        );
      } else {
        setActivity([]);
      }

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
  const firstName = myName?.trim().split(" ")[0];
  const roleLabel = roles.length > 0 ? roles.map((r) => r.replace("_", " ")).join(", ") : "No role assigned";

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        {orgName && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">{orgName}</span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          {greeting()}, {firstName || email}
        </h1>
        <p className="text-muted-foreground mt-1 capitalize">{roleLabel}</p>
      </div>


      {/* Stats cards */}
      {loadingStats ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            to="/admin/farmers"
            label="Total Farmers"
            value={stats.totalFarmers}
            icon={Sprout}
            color="text-primary"
            bgColor="bg-primary/10"
          />
          <StatCard
            to="/admin/farmers?status=submitted"
            label="Pending Review"
            value={stats.pendingFarmers}
            icon={Clock}
            color="text-yellow-500"
            bgColor="bg-yellow-500/10"
          />
          <StatCard
            to="/admin/farmers?status=verified"
            label="Verified"
            value={stats.verifiedFarmers}
            icon={CheckCircle}
            color="text-green-500"
            bgColor="bg-green-500/10"
          />
          <StatCard
            to="/admin/farmers?status=rejected"
            label="Rejected"
            value={stats.rejectedFarmers}
            icon={XCircle}
            color="text-destructive"
            bgColor="bg-destructive/10"
          />
          {isAdmin && (
            <StatCard
              to="/admin/users"
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

      {/* Two-column: activity + leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="kyf-card-flat p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/admin/farmer/${a.farmer_id}`}
                      className="text-sm text-foreground hover:underline"
                    >
                      <span className="font-medium">{a.actor_name}</span>{" "}
                      <span className="text-muted-foreground">{describeAction(a)}</span>{" "}
                      <span className="font-medium">{a.farmer_name}</span>
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {relativeTime(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isAdmin && (
          <div className="kyf-card-flat p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Top Enumerators</h2>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No enrollments yet.</p>
            ) : (
              <ol className="space-y-2">
                {leaderboard.map((l, i) => (
                  <li key={l.user_id} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm text-foreground flex-1 truncate">{l.full_name}</span>
                    <span className="text-sm font-semibold text-foreground">{l.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
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

function describeAction(a: ActivityRow): string {
  switch (a.action) {
    case "created": return "created";
    case "submitted": return "submitted";
    case "verified": return "verified";
    case "rejected": return "rejected";
    case "updated": return "updated";
    case "status_changed": return `moved ${a.from_status || "?"} → ${a.to_status || "?"} for`;
    default: return a.action;
  }
}

function StatCard({
  to,
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  to: string;
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <Link
      to={to}
      className="kyf-card p-4 kyf-slide-up hover:border-primary/30 transition-colors block"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Link>
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
