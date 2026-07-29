import { supabase } from "@/integrations/supabase/client";

export interface FarmHealthBreakdownItem {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface FarmHealthScore {
  id: string;
  farmer_id: string;
  organization_id: string;
  score: number;
  band: string;
  breakdown: FarmHealthBreakdownItem[];
  computed_at: string;
  engine_version: string;
}

export function bandColor(band: string): string {
  switch (band) {
    case "Thriving":
      return "text-green-600 bg-green-500/10";
    case "Healthy":
      return "text-emerald-600 bg-emerald-500/10";
    case "Developing":
      return "text-yellow-600 bg-yellow-500/10";
    case "At risk":
    default:
      return "text-destructive bg-destructive/10";
  }
}

export async function getFarmHealth(farmerId: string): Promise<FarmHealthScore | null> {
  const { data } = await supabase
    .from("farm_health_scores")
    .select("*")
    .eq("farmer_id", farmerId)
    .maybeSingle();
  return (data as unknown as FarmHealthScore) ?? null;
}

export async function computeFarmHealth(farmerId: string): Promise<FarmHealthScore | null> {
  const { data, error } = await supabase.rpc("compute_farm_health", { _farmer_id: farmerId });
  if (error) throw error;
  return (data as unknown as FarmHealthScore) ?? null;
}
