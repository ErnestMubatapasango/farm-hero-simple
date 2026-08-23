import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveOrg } from "@/hooks/useActiveOrg";
import { OrgSwitcher, SelectOrgNotice } from "@/components/OrgSwitcher";
import { usePermissions } from "@/hooks/usePermissions";
import { isOrgAdmin, isPlatformDeveloper, isFieldAgentOnly, PERMISSIONS } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { GerminatingLogo } from "@/components/GerminatingLogo";
import { Search, Gauge, RefreshCw, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadAndComputeScore } from "@/lib/credit-score-service";

interface FarmerRow {
  id: string;
  first_name: string;
  last_name: string;
  region: string | null;
  primary_crops: string[] | null;
  status: string;
  enrolled_by: string;
}

interface ScoreRow {
  farmer_id: string;
  score: number;
  band: string;
  computed_at: string;
}

function bandColor(score: number) {
  if (score < 500) return "text-destructive";
  if (score < 620) return "text-yellow-600";
  if (score < 720) return "text-yellow-500";
  if (score < 800) return "text-primary";
  return "text-green-600";
}

export default function CreditScore() {
  const { roles, session,  hasRole, hasAnyRole } = useAuth();
  const { activeOrganizationId: organizationId, needsOrgSelection } = useActiveOrg();
  const { toast } = useToast();
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const { can } = usePermissions();
  const isAdmin = can(PERMISSIONS.creditView) || isOrgAdmin(roles);
  const enumeratorOnly = isFieldAgentOnly(roles);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("farmers")
      .select("id, first_name, last_name, region, primary_crops, status, enrolled_by")
      .order("created_at", { ascending: false });
    if (organizationId) {
      q = q.eq("organization_id", organizationId);
    }
    if (enumeratorOnly && session?.user?.id) {
      q = q.eq("enrolled_by", session.user.id);
    }
    const { data: fdata } = await q;
    const list = (fdata as FarmerRow[]) || [];
    setFarmers(list);

    if (list.length > 0) {
      const { data: sdata } = await supabase
        .from("credit_scores")
        .select("farmer_id, score, band, computed_at")
        .in(
          "farmer_id",
          list.map((f) => f.id)
        );
      const map: Record<string, ScoreRow> = {};
      for (const s of (sdata as ScoreRow[]) || []) map[s.farmer_id] = s;
      setScores(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, session?.user?.id]);

  const recomputeAll = async () => {
    setRecomputing(true);
    let ok = 0;
    let fail = 0;
    const batchSize = 5;
    for (let i = 0; i < farmers.length; i += batchSize) {
      const batch = farmers.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (f) => {
          try {
            await loadAndComputeScore(f.id, { force: true });
            ok++;
          } catch {
            fail++;
          }
        })
      );
    }
    toast({ title: `Recomputed ${ok} score(s)`, description: fail ? `${fail} failed` : undefined });
    setRecomputing(false);
    load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return farmers.filter((f) => {
      if (verifiedOnly && f.status !== "verified") return false;
      if (!q) return true;
      return (
        `${f.first_name} ${f.last_name}`.toLowerCase().includes(q) ||
        f.region?.toLowerCase().includes(q) ||
        f.primary_crops?.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [farmers, search, verifiedOnly]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <GerminatingLogo fullScreen={false} message="Loading credit scores..." />;
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Credit Scores</h1>
          <p className="text-muted-foreground mt-1">
            Creditworthiness across {farmers.length} farmer(s).
          </p>
          <OrgSwitcher className="mt-3" />
        </div>
        {isAdmin && farmers.length > 0 && (
          <Button onClick={recomputeAll} disabled={recomputing} variant="outline" size="sm">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
            Recompute all
          </Button>
        )}
      </div>

      {needsOrgSelection && <SelectOrgNotice what="credit scores" />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, region, crop..."
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setVerifiedOnly((v) => !v)}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
            verifiedOnly
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border"
          }`}
        >
          Verified only
        </button>
      </div>

      <div className="kyf-card-flat divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No farmers found.</p>
        ) : (
          filtered.map((f) => {
            const s = scores[f.id];
            return (
              <Link
                key={f.id}
                to={`/credit-score/${f.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Gauge className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {f.first_name} {f.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[f.region, f.primary_crops?.join(", ")].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {s ? (
                    <>
                      <p className={`text-lg font-bold ${bandColor(s.score)}`}>{s.score}</p>
                      <p className="text-[10px] text-muted-foreground">{s.band}</p>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">not computed</span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
