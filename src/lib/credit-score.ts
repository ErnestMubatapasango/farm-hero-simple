// KYF Credit Score types.
//
// The scoring engine itself lives server-side in the Postgres function
// public.compute_credit_score (engine v2). The client no longer computes or
// mutates scores — it only renders what the database returns. These types
// describe that payload.

export type ScoreBreakdown = {
  key: string;
  label: string;
  score: number; // 0-100 normalized
  weight: number; // weight share (0-1); the confidence row has weight 0
  weighted: number; // score * weight
  detail: string;
  /** Lending row only: indicative facility bounds and the turnover they derive from. */
  min?: number;
  max?: number;
  basis?: number;
};


export type CreditScoreBand =
  | "Insufficient data"
  | "Poor"
  | "Fair"
  | "Good"
  | "Very Good"
  | "Excellent";

export type CreditScoreResult = {
  score: number; // 300-850
  band: CreditScoreBand;
  bandColor: string; // tailwind token
  breakdown: ScoreBreakdown[];
  recommendations: string[];
};

/** Key used by the server engine for the data-confidence row in the breakdown. */
export const CONFIDENCE_KEY = "confidence";

/** Key used by the server engine for the lending-guidance row in the breakdown. */
export const LENDING_KEY = "lending";

/** Rows that are metadata, not scored factors. */
export const META_KEYS = [CONFIDENCE_KEY, LENDING_KEY];

/** Confidence below this percentage means the score is not trustworthy. */
export const CONFIDENCE_THRESHOLD = 50;

/** Scored factors only, excluding the confidence/lending metadata rows. */
export function getFactors(breakdown: ScoreBreakdown[]): ScoreBreakdown[] {
  return breakdown.filter((b) => !META_KEYS.includes(b.key));
}

/** Factors that support the score (strong performance). */
export function getPositiveFactors(breakdown: ScoreBreakdown[]): ScoreBreakdown[] {
  return getFactors(breakdown)
    .filter((b) => b.score >= 60)
    .sort((a, b) => b.weighted - a.weighted);
}

/** Factors that drag the score down or are missing entirely. */
export function getNegativeFactors(breakdown: ScoreBreakdown[]): ScoreBreakdown[] {
  return getFactors(breakdown)
    .filter((b) => b.score < 60)
    .sort((a, b) => a.score * a.weight - b.score * b.weight);
}

/** Pulls the lending-guidance row out of a breakdown, if present. */
export function getLending(breakdown: ScoreBreakdown[]): ScoreBreakdown | null {
  return breakdown.find((b) => b.key === LENDING_KEY) ?? null;
}


/** Pulls the data-confidence percentage out of a breakdown, if present. */
export function getConfidence(breakdown: ScoreBreakdown[]): number | null {
  const row = breakdown.find((b) => b.key === CONFIDENCE_KEY);
  return row ? Math.round(row.score) : null;
}
