import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function Analytics() {
  const { session } = useAuth();
  const { format, convert, currency } = useCurrency();
  const userId = session?.user?.id;
  const [cropData, setCropData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const load = async () => {
      const { data, error } = await supabase
        .from("crop_history")
        .select("*")
        .eq("user_id", userId)
        .order("year", { ascending: true });
      if (!error && data) setCropData(data);
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (cropData.length === 0) {
    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-4">No crop history data yet. Complete your onboarding to see analytics.</p>
      </div>
    );
  }

  // Group by year for chart data
  const yearMap = {};
  cropData.forEach((row) => {
    if (!yearMap[row.year]) yearMap[row.year] = { year: row.year, totalYield: 0, totalRevenue: 0 };
    yearMap[row.year].totalYield += Number(row.yield_amount || 0);
    yearMap[row.year].totalRevenue += Number(row.revenue || 0);
  });
  const chartData = Object.values(yearMap)
    .sort((a, b) => (a as any).year - (b as any).year)
    .map((d: any) => ({ ...d, totalRevenue: convert(d.totalRevenue) }));

  // Per-crop comparison
  const crops = [...new Set(cropData.map((r) => r.crop))];
  const years = [...new Set(cropData.map((r) => r.year))].sort();

  const cropComparison = crops.map((crop) => {
    const entries = cropData.filter((r) => r.crop === crop).sort((a, b) => a.year - b.year);
    const latest = entries[entries.length - 1];
    const prev = entries.length > 1 ? entries[entries.length - 2] : null;
    const yieldChange = prev && prev.yield_amount ? ((Number(latest.yield_amount || 0) - Number(prev.yield_amount)) / Number(prev.yield_amount) * 100) : null;
    const revenueChange = prev && prev.revenue ? ((Number(latest.revenue || 0) - Number(prev.revenue)) / Number(prev.revenue) * 100) : null;
    return { crop, entries, yieldChange, revenueChange, latest, prev };
  });

  // Overall totals
  const totalYieldAll = cropData.reduce((s, r) => s + Number(r.yield_amount || 0), 0);
  const totalRevenueAll = cropData.reduce((s, r) => s + Number(r.revenue || 0), 0);

  function TrendIcon({ value }) {
    if (value === null) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Performance analysis across {years.length} year{years.length > 1 ? "s" : ""} ({years.join(" – ")}).
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 kyf-slide-up" style={{ animationDelay: "60ms" }}>
        <div className="kyf-card p-5 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Yield</p>
          <p className="text-2xl font-bold tabular-nums">{totalYieldAll.toLocaleString()} kg</p>
        </div>
        <div className="kyf-card p-5 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold tabular-nums">{format(totalRevenueAll)}</p>
        </div>
        <div className="kyf-card p-5 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Crops Tracked</p>
          <p className="text-2xl font-bold">{crops.length}</p>
        </div>
      </div>

      {/* Crop Performance Cards */}
      {cropComparison.length > 0 && (
        <div className="space-y-3 kyf-slide-up" style={{ animationDelay: "120ms" }}>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Year-over-Year Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cropComparison.map(({ crop, yieldChange, revenueChange, latest, prev }) => (
              <div key={crop} className="kyf-card p-5 space-y-3">
                <h3 className="font-semibold capitalize text-foreground">{crop}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Yield</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{Number(latest?.yield_amount || 0).toLocaleString()} kg</span>
                      {yieldChange !== null && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium ${yieldChange > 0 ? "text-green-600" : yieldChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          <TrendIcon value={yieldChange} />
                          {Math.abs(yieldChange).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Revenue</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{format(Number(latest?.revenue || 0))}</span>
                      {revenueChange !== null && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium ${revenueChange > 0 ? "text-green-600" : revenueChange < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          <TrendIcon value={revenueChange} />
                          {Math.abs(revenueChange).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {prev && (
                    <p className="text-xs text-muted-foreground pt-1">
                      vs {prev.year}: {Number(prev.yield_amount || 0).toLocaleString()} kg / {format(Number(prev.revenue || 0))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="kyf-card p-6 kyf-slide-up" style={{ animationDelay: "160ms" }}>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Yield by Year (kg)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: "13px" }} />
                <Bar dataKey="totalYield" name="Total Yield (kg)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="kyf-card p-6 kyf-slide-up" style={{ animationDelay: "240ms" }}>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-4">Revenue Trend ({currency})</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: "0.5rem", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", fontSize: "13px" }} />
                <Line type="monotone" dataKey="totalRevenue" name={`Total Revenue (${currency})`} stroke="hsl(var(--accent-foreground))" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="kyf-card-flat overflow-hidden kyf-slide-up" style={{ animationDelay: "320ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Year</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Crop</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Yield (kg)</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Revenue ({currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cropData.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-medium tabular-nums">{row.year}</td>
                  <td className="px-5 py-3 text-muted-foreground capitalize">{row.crop}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{Number(row.yield_amount || 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{format(Number(row.revenue || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
