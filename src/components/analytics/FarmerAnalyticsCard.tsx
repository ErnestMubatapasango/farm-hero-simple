import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  bandColor,
  computeFarmHealth,
  getFarmHealth,
  type FarmHealthScore,
} from "@/lib/farm-health";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  farmerId: string;
  farmerName?: string;
  farmSize?: number | null;
  annualIncome?: number | null;
}

interface YieldRow {
  crop: string;
  year: number;
  yield_kg: number | null;
  revenue_usd: number | null;
}

interface CreditRow {
  score: number;
  band: string;
  computed_at: string;
}

export default function FarmerAnalyticsCard({ farmerId, farmerName, farmSize, annualIncome }: Props) {
  const { toast } = useToast();
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(["admin", "super_admin", "developer"]);

  const [yields, setYields] = useState<YieldRow[]>([]);
  const [health, setHealth] = useState<FarmHealthScore | null>(null);
  const [credit, setCredit] = useState<CreditRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [yRes, hRes, cRes] = await Promise.all([
      supabase
        .from("crop_yield_history")
        .select("crop,year,yield_kg,revenue_usd")
        .eq("farmer_id", farmerId)
        .order("year"),
      getFarmHealth(farmerId),
      isAdmin
        ? supabase.from("credit_scores").select("score,band,computed_at").eq("farmer_id", farmerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setYields((yRes.data as YieldRow[]) || []);
    setHealth(hRes);
    setCredit(((cRes as { data: CreditRow | null }).data) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerId]);

  const yieldChart = useMemo(() => {
    const map = new Map<number, Record<string, number | string>>();
    yields.forEach((y) => {
      const row = map.get(y.year) ?? { year: y.year };
      row[y.crop] = y.yield_kg ?? 0;
      map.set(y.year, row);
    });
    return Array.from(map.values()).sort((a, b) => Number(a.year) - Number(b.year));
  }, [yields]);

  const revenueChart = useMemo(() => {
    const map = new Map<number, number>();
    yields.forEach((y) => {
      map.set(y.year, (map.get(y.year) ?? 0) + Number(y.revenue_usd ?? 0));
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, revenue]) => ({ year, revenue }));
  }, [yields]);

  const crops = useMemo(() => Array.from(new Set(yields.map((y) => y.crop))), [yields]);

  const recompute = async () => {
    setComputing(true);
    try {
      const row = await computeFarmHealth(farmerId);
      setHealth(row);
      toast({ title: "Farm Health Index updated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Compute failed", description: message, variant: "destructive" });
    }
    setComputing(false);
  };

  if (loading) {
    return (
      <div className="kyf-card p-5 flex items-center justify-center min-h-[120px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="kyf-card p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" />
          Analytics {farmerName ? `— ${farmerName}` : ""}
        </div>
        <Button size="sm" variant="outline" onClick={recompute} disabled={computing}>
          {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Recompute
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Farm Health Index */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Farm Health Index
            </p>
            {health && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bandColor(health.band)}`}>
                {health.band}
              </span>
            )}
          </div>
          {health ? (
            <>
              <p className="text-4xl font-bold text-foreground">{health.score}<span className="text-lg text-muted-foreground">/100</span></p>
              <div className="space-y-1.5">
                {health.breakdown.map((b) => (
                  <div key={b.key}>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">{b.label}</span>
                      <span className="text-muted-foreground">{Math.round(b.score)}/100 · {Math.round(b.weight * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, b.score)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{b.detail}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Farm Health Index yet. Click Recompute to generate one.
            </p>
          )}
        </div>

        {/* Snapshot + credit score */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Snapshot
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Farm size" value={farmSize != null ? `${farmSize} ha` : "—"} />
            <Metric label="Annual income" value={annualIncome != null ? `$${Number(annualIncome).toLocaleString()}` : "—"} />
            <Metric label="Yield records" value={String(yields.length)} />
            <Metric label="Crops tracked" value={String(crops.length)} />
          </div>

          {isAdmin && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Credit score
              </p>
              {credit ? (
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold text-foreground">{credit.score}</p>
                  <span className="text-xs text-muted-foreground">{credit.band}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not computed yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {yieldChart.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Yield trend (kg)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={yieldChart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {crops.map((c, i) => (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stroke={`hsl(${(i * 80) % 360} 60% 45%)`}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {revenueChart.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Revenue by year (USD)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
