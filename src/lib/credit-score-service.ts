import { supabase } from "@/integrations/supabase/client";
import type { CreditScoreResult, ScoreBreakdown } from "@/lib/credit-score";

// Server-authoritative credit score. Clients no longer compute or upsert
// scores — the compute_credit_score RPC reads inputs inside the database,
// scores them, and persists the row. This keeps the engine tamper-proof.

export interface PersistedScore {
  farmer_id: string;
  organization_id: string;
  score: number;
  band: string;
  breakdown: ScoreBreakdown[];
  recommendations: string[];
  inputs_hash: string | null;
  computed_at: string;
  computed_by: string | null;
  engine_version?: string;
}

function bandColorFor(band: string): string {
  switch (band) {
    case "Poor":
      return "text-destructive";
    case "Fair":
    case "Good":
      return "text-kyf-amber";
    default:
      return "text-primary";
  }
}

export async function loadAndComputeScore(
  farmerId: string,
  _opts: { force?: boolean } = {}
): Promise<CreditScoreResult & { persisted: PersistedScore | null }> {
  const { data, error } = await supabase.rpc("compute_credit_score", { _farmer_id: farmerId });
  if (error) throw error;
  // rpc returning a composite type comes back as a single row object.
  const row = (Array.isArray(data) ? data[0] : data) as PersistedScore | null;
  if (!row) throw new Error("Failed to compute score");
  const band = row.band as CreditScoreResult["band"];
  return {
    score: row.score,
    band,
    bandColor: bandColorFor(row.band),
    breakdown: (row.breakdown as ScoreBreakdown[]) || [],
    recommendations: (row.recommendations as string[]) || [],
    persisted: row,
  };
}

// Read-only fetch used by list views.
export async function fetchStoredScore(farmerId: string): Promise<PersistedScore | null> {
  const { data } = await supabase
    .from("credit_scores")
    .select("*")
    .eq("farmer_id", farmerId)
    .maybeSingle();
  return (data as unknown as PersistedScore | null) ?? null;
}
