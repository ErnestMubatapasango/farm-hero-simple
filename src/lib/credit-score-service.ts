import { supabase } from "@/integrations/supabase/client";
import { computeCreditScore, type CreditScoreResult } from "@/lib/credit-score";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PersistedScore {
  farmer_id: string;
  organization_id: string;
  score: number;
  band: string;
  breakdown: any;
  recommendations: any;
  inputs_hash: string | null;
  computed_at: string;
  computed_by: string | null;
}

export async function fetchScoreInputs(farmerId: string) {
  const [farmerRes, cropsRes, yieldRes, docsRes] = await Promise.all([
    supabase.from("farmers").select("*").eq("id", farmerId).maybeSingle(),
    supabase.from("farmer_crops").select("*").eq("farmer_id", farmerId),
    supabase.from("crop_yield_history").select("*").eq("farmer_id", farmerId),
    supabase.from("farmer_documents").select("*").eq("farmer_id", farmerId),
  ]);
  return {
    farmer: farmerRes.data as any,
    crops: (cropsRes.data as any[]) || [],
    yields: (yieldRes.data as any[]) || [],
    docs: (docsRes.data as any[]) || [],
  };
}

export function buildEngineInputs(args: {
  farmer: any;
  crops: any[];
  yields: any[];
  docs: any[];
}) {
  const { farmer, crops, yields, docs } = args;
  const farming_methods = crops
    .map((c) => c.farming_method)
    .filter(Boolean);
  return {
    farmProfile: {
      farm_size_hectares: farmer?.farm_size_hectares ?? 0,
      region: farmer?.region,
      district: farmer?.district,
      coordinates_latitude: null,
      coordinates_longitude: null,
      farming_methods,
    },
    financialRecord: {
      annual_income: farmer?.annual_income ?? 0,
      annual_expenses: 0,
      has_bank_account: !!farmer?.has_bank_account,
      loan_status: "none",
    },
    documents: docs.map((d) => ({ status: d.status })),
    cropHistory: yields.map((y) => ({
      year: y.year,
      yield_amount: Number(y.yield_kg ?? 0),
    })),
    profile: {
      full_name: `${farmer?.first_name ?? ""} ${farmer?.last_name ?? ""}`.trim(),
      phone: farmer?.phone,
    },
  };
}

export async function loadAndComputeScore(
  farmerId: string,
  opts: { force?: boolean } = {}
): Promise<CreditScoreResult & { persisted: PersistedScore | null }> {
  const inputs = await fetchScoreInputs(farmerId);
  if (!inputs.farmer) throw new Error("Farmer not found");

  const engineInputs = buildEngineInputs(inputs);
  const result = computeCreditScore(engineInputs);

  const hash = await sha256Hex(JSON.stringify(engineInputs));

  const { data: existing } = await supabase
    .from("credit_scores")
    .select("*")
    .eq("farmer_id", farmerId)
    .maybeSingle();

  let persisted: PersistedScore | null = (existing as any) || null;

  if (!existing || existing.inputs_hash !== hash || opts.force) {
    const { data: userData } = await supabase.auth.getUser();
    const row = {
      farmer_id: farmerId,
      organization_id: inputs.farmer.organization_id,
      score: result.score,
      band: result.band,
      breakdown: result.breakdown as any,
      recommendations: result.recommendations as any,
      inputs_hash: hash,
      computed_by: userData.user?.id ?? null,
      computed_at: new Date().toISOString(),
    };
    const { data: upserted, error } = await supabase
      .from("credit_scores")
      .upsert(row, { onConflict: "farmer_id" })
      .select()
      .single();
    if (error) throw error;
    persisted = upserted as any;
  }

  return { ...result, persisted };
}
