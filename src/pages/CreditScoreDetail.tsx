import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isOrgAdmin } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Gauge, RefreshCw, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAndComputeScore } from "@/lib/credit-score-service";
import type { CreditScoreResult } from "@/lib/credit-score";

interface FarmerHead {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
}

function bandColor(score: number) {
  if (score < 500) return "text-destructive";
  if (score < 620) return "text-yellow-600";
  if (score < 720) return "text-yellow-500";
  if (score < 800) return "text-primary";
  return "text-green-600";
}

export default function CreditScoreDetail() {
  const { farmerId } = useParams<{ farmerId: string }>();
  const { roles, hasAnyRole } = useAuth();
  const isAdmin = isOrgAdmin(roles);
  const { toast } = useToast();
  const [farmer, setFarmer] = useState<FarmerHead | null>(null);
  const [result, setResult] = useState<CreditScoreResult | null>(null);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const compute = async (force = false) => {
    if (!farmerId) return;
    try {
      const r = await loadAndComputeScore(farmerId, { force });
      setResult(r);
      setComputedAt(r.persisted?.computed_at ?? new Date().toISOString());
    } catch (e: any) {
      toast({ title: "Compute failed", description: e.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!farmerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("farmers")
        .select("id, first_name, last_name, status")
        .eq("id", farmerId)
        .maybeSingle();
      setFarmer(data as FarmerHead);
      await compute(false);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmerId]);

  const handleRecompute = async () => {
    setRecomputing(true);
    await compute(true);
    toast({ title: "Score recomputed" });
    setRecomputing(false);
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!farmer || !result) {
    return (
      <div className="p-8 text-center text-muted-foreground">Score unavailable.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/credit-score"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {farmer.first_name} {farmer.last_name}
          </h1>
          <Link
            to={`/admin/farmer/${farmer.id}`}
            className="text-xs text-primary hover:underline"
          >
            View farmer record →
          </Link>
        </div>
        <Button onClick={handleRecompute} disabled={recomputing} variant="outline" size="sm">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </div>

      {/* Score gauge */}
      <div className="kyf-card p-8 text-center space-y-2">
        <Gauge className={`h-10 w-10 mx-auto ${bandColor(result.score)}`} />
        <p className={`text-6xl font-bold ${bandColor(result.score)}`}>{result.score}</p>
        <p className="text-lg font-medium text-foreground">{result.band}</p>
        <p className="text-xs text-muted-foreground">
          Range 300–850 · Last computed{" "}
          {computedAt ? new Date(computedAt).toLocaleString() : "just now"}
        </p>
      </div>

      {/* Breakdown */}
      <div className="kyf-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Breakdown</h2>
        <div className="space-y-3">
          {result.breakdown.map((b) => (
            <div key={b.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{b.label}</span>
                <span className="text-muted-foreground">
                  {Math.round(b.score)} / 100 · weight {Math.round(b.weight * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(b.score, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{b.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="kyf-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-primary" />
            Recommendations
          </div>
          <ul className="space-y-2">
            {result.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-primary">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
