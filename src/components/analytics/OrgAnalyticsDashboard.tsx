import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Users, Ruler, TrendingUp, ShieldCheck } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface FarmerRow {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  farm_size_hectares: number | null;
  primary_crops: string[] | null;
}

interface YieldRow {
  farmer_id: string;
  crop: string;
  year: number;
  yield_kg: number | null;
  revenue_usd: number | null;
}

interface HealthRow {
  farmer_id: string;
  score: number;
  band: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "hsl(35 90% 55%)",
  submitted: "hsl(210 80% 55%)",
  verified: "hsl(145 60% 45%)",
  rejected: "hsl(0 70% 55%)",
};

export default function OrgAnalyticsDashboard() {
  const { organizationId } = useAuth();
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [yields, setYields] = useState<YieldRow[]>([]);
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      setLoading(true);
      const [f, y, h] = await Promise.all([
        supabase
          .from("farmers")
          .select("id,first_name,last_name,status,farm_size_hectares,primary_crops")
          .eq("organization_id", organizationId),
        supabase
          .from("crop_yield_history")
          .select("farmer_id,crop,year,yield_kg,revenue_usd")
          .eq("organization_id", organizationId),
        supabase
          .from("farm_health_scores")
          .select("farmer_id,score,band")
          .eq("organization_id", organizationId),
      ]);
      setFarmers((f.data as FarmerRow[]) || []);
      setYields((y.data as YieldRow[]) || []);
      setHealth((h.data as HealthRow[]) || []);
      setLoading(false);
    })();
  }, [organizationId]);

  const stats = useMemo(() => {
    const totalHa = farmers.reduce((s, f) => s + Number(f.farm_size_hectares ?? 0), 0);
    const verified = farmers.filter((f) => f.status === "verified").length;
    const avgHealth =
      health.length > 0 ? Math.round(health.reduce((s, r) => s + r.score, 0) / health.length) : 0;
    return {
      totalFarmers: farmers.length,
      totalHa: Math.round(totalHa * 10) / 10,
      verified,
      avgHealth,
    };
  }, [farmers, health]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    farmers.forEach((f) => {
      counts[f.status] = (counts[f.status] ?? 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [farmers]);

  const cropYieldData = useMemo(() => {
    const map = new Map<string, number>();
    yields.forEach((y) => {
      map.set(y.crop, (map.get(y.crop) ?? 0) + Number(y.yield_kg ?? 0));
    });
    return Array.from(map.entries())
      .map(([crop, yield_kg]) => ({ crop, yield_kg }))
      .sort((a, b) => b.yield_kg - a.yield_kg)
      .slice(0, 8);
  }, [yields]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    farmers.forEach((f) => m.set(f.id, `${f.first_name} ${f.last_name}`));
    return m;
  }, [farmers]);

  const leaderboard = useMemo(() => {
    return [...health]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((h) => ({ ...h, name: nameById.get(h.farmer_id) ?? "Unknown" }));
  }, [health, nameById]);

  if (loading) {
    return (
      <div className="kyf-card p-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Farmers" value={stats.totalFarmers} />
        <Kpi icon={ShieldCheck} label="Verified" value={stats.verified} />
        <Kpi icon={Ruler} label="Total hectares" value={stats.totalHa} />
        <Kpi icon={TrendingUp} label="Avg. Farm Health" value={stats.avgHealth} suffix="/100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="kyf-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Farmers by status
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} dataKey="count" nameKey="status" outerRadius={80} label>
                {statusData.map((d) => (
                  <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "hsl(var(--primary))"} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="kyf-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Top crops by total yield (kg)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cropYieldData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="crop" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="yield_kg" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="kyf-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Farm Health leaderboard
        </p>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scores computed yet.</p>
        ) : (
          <ul className="space-y-2">
            {leaderboard.map((l, i) => (
              <li key={l.farmer_id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2">
                <span className="text-foreground">
                  {i + 1}. {l.name}
                </span>
                <span className="font-semibold text-primary">
                  {l.score} <span className="text-xs text-muted-foreground font-normal">· {l.band}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="kyf-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground mt-1">
        {value}
        {suffix && <span className="text-sm text-muted-foreground font-normal">{suffix}</span>}
      </p>
    </div>
  );
}
