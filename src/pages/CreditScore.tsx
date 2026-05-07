import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Info, Lightbulb, Gauge } from "lucide-react";
import { computeCreditScore, type CreditScoreResult } from "@/lib/credit-score";

export default function CreditScore() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CreditScoreResult | null>(null);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      setLoading(true);
      const [profileRes, farmerRes, financialRes, docsRes, cropsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("farm_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("financial_records").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("documents").select("*").eq("user_id", userId),
        supabase.from("crop_history").select("*").eq("user_id", userId),
      ]);
      const r = computeCreditScore({
        profile: profileRes.data,
        farmProfile: farmerRes.data,
        financialRecord: financialRes.data,
        documents: docsRes.data || [],
        cropHistory: cropsRes.data || [],
      });
      setResult(r);
      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading || !result) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Gauge math: arc 300 → 850
  const pct = (result.score - 300) / 550;
  const angle = -90 + pct * 180; // -90 (left) → +90 (right)

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
      <div className="kyf-slide-up">
        <h1 className="text-2xl font-bold text-foreground leading-tight flex items-center gap-2">
          <Gauge className="h-6 w-6 text-primary" /> Credit Score
        </h1>
        <p className="text-muted-foreground mt-1">
          Your financing readiness score, calculated from your farm profile and history.
        </p>
      </div>

      {/* Score gauge */}
      <div className="kyf-card p-6 sm:p-8 kyf-slide-up" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-col items-center">
          <div className="relative w-64 h-32 sm:w-80 sm:h-40">
            <svg viewBox="0 0 200 110" className="w-full h-full">
              <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
              <path
                d="M 10 100 A 90 90 0 0 1 190 100"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${pct * 283} 283`}
              />
              <line
                x1="100" y1="100"
                x2={100 + 70 * Math.cos((angle * Math.PI) / 180)}
                y2={100 + 70 * Math.sin((angle * Math.PI) / 180)}
                stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round"
              />
              <circle cx="100" cy="100" r="6" fill="hsl(var(--foreground))" />
            </svg>
          </div>
          <p className={`text-5xl font-bold tabular-nums mt-2 ${result.bandColor}`}>{result.score}</p>
          <p className={`text-sm font-medium mt-1 ${result.bandColor}`}>{result.band}</p>
          <p className="text-xs text-muted-foreground mt-1">Range 300 – 850</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="kyf-slide-up" style={{ animationDelay: "120ms" }}>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" /> Score Breakdown
        </h2>
        <div className="kyf-card-flat divide-y divide-border">
          {result.breakdown.map((b) => (
            <div key={b.key} className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{b.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{b.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">{Math.round(b.score)}<span className="text-muted-foreground">/100</span></p>
                  <p className="text-xs text-muted-foreground">Weight {Math.round(b.weight * 100)}%</p>
                </div>
              </div>
              <Progress value={b.score} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="kyf-slide-up" style={{ animationDelay: "180ms" }}>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-kyf-amber" /> How to improve
          </h2>
          <div className="kyf-card-flat p-5 space-y-3">
            {result.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-kyf-sand text-kyf-earth text-xs font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm text-foreground">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology */}
      <div className="kyf-card-flat p-5 flex gap-3 kyf-slide-up" style={{ animationDelay: "240ms" }}>
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Score is computed from six weighted pillars: yield history (25%), yield growth (15%), farm size (10%),
          farming methods (15%), financial health (20%) and verification (15%). The weighted total is mapped to a
          300–850 band similar to standard credit ratings. Scores update as your profile evolves.
        </p>
      </div>
    </div>
  );
}
