// KYF Credit Score Engine
// Score: 300 - 850 (FICO-style band)
// Weighted across 6 pillars totaling 100 points, then mapped to 300-850.

export type ScoreBreakdown = {
  key: string;
  label: string;
  score: number; // 0-100 normalized
  weight: number; // weight share (0-1)
  weighted: number; // score * weight
  detail: string;
};

export type CreditScoreResult = {
  score: number; // 300-850
  band: "Poor" | "Fair" | "Good" | "Very Good" | "Excellent";
  bandColor: string; // tailwind token
  breakdown: ScoreBreakdown[];
  recommendations: string[];
};

const WEIGHTS = {
  yieldHistory: 0.25,
  yieldGrowth: 0.15,
  farmSize: 0.10,
  farmingMethods: 0.15,
  financialHealth: 0.20,
  profileVerification: 0.15,
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function computeCreditScore(args: {
  farmProfile: any;
  financialRecord: any;
  documents: any[];
  cropHistory: any[];
  profile: any;
}): CreditScoreResult {
  const { farmProfile, financialRecord, documents, cropHistory, profile } = args;

  // 1. Yield History — consistency & volume
  let yieldScore = 0;
  let yieldDetail = "No yield history recorded";
  if (cropHistory.length > 0) {
    const validYields = cropHistory.filter((c) => c.yield_amount > 0);
    const avgYield = validYields.reduce((s, c) => s + Number(c.yield_amount || 0), 0) / Math.max(validYields.length, 1);
    const yearsTracked = new Set(cropHistory.map((c) => c.year)).size;
    // 50pt for record count (up to 4 yrs), 50pt for avg yield (benchmark 2000kg/ha)
    const recordPts = Math.min(yearsTracked / 4, 1) * 50;
    const sizeHa = Number(farmProfile?.farm_size_hectares || 1);
    const yieldPerHa = avgYield / Math.max(sizeHa, 0.5);
    const yieldPts = Math.min(yieldPerHa / 2000, 1) * 50;
    yieldScore = clamp(recordPts + yieldPts);
    yieldDetail = `${yearsTracked} yr(s), avg ${Math.round(avgYield)}kg`;
  }

  // 2. Yield Growth — YoY trend
  let growthScore = 0;
  let growthDetail = "Need 2+ years to assess";
  if (cropHistory.length >= 2) {
    const sorted = [...cropHistory].sort((a, b) => a.year - b.year);
    const first = Number(sorted[0].yield_amount || 0);
    const last = Number(sorted[sorted.length - 1].yield_amount || 0);
    if (first > 0) {
      const growth = ((last - first) / first) * 100;
      // -20% → 0, 0% → 50, +30%+ → 100
      growthScore = clamp(50 + growth * 1.5);
      growthDetail = `${growth >= 0 ? "+" : ""}${Math.round(growth)}% YoY`;
    }
  }

  // 3. Farm Size — capacity proxy
  const size = Number(farmProfile?.farm_size_hectares || 0);
  // <0.5ha=20, 1ha=40, 3ha=70, 5ha+=100
  const farmSizeScore = clamp(size <= 0 ? 0 : 20 + Math.log2(Math.max(size, 0.5) + 1) * 35);
  const farmSizeDetail = size > 0 ? `${size} hectares` : "Not provided";

  // 4. Farming Methods — sustainability bonus
  const methods = farmProfile?.farming_methods;
  let methodCount = 0;
  if (Array.isArray(methods)) methodCount = methods.length;
  else if (methods && typeof methods === "object") methodCount = Object.keys(methods).length;
  // Each documented method = 25pt, capped
  const methodScore = clamp(methodCount * 25);
  const methodDetail = methodCount > 0 ? `${methodCount} method(s) recorded` : "No methods recorded";

  // 5. Financial Health — banking, income, loan status
  let finScore = 0;
  const finParts: string[] = [];
  if (financialRecord) {
    if (financialRecord.has_bank_account === "yes" || financialRecord.has_bank_account === true) {
      finScore += 30;
      finParts.push("banked");
    }
    const income = Number(financialRecord.annual_income || 0);
    const expenses = Number(financialRecord.annual_expenses || 0);
    if (income > 0) {
      const margin = (income - expenses) / income;
      finScore += clamp(margin * 100, 0, 40); // up to 40pt for healthy margin
      finParts.push(`${Math.round(margin * 100)}% margin`);
    }
    const loan = financialRecord.loan_status;
    if (loan === "fully_repaid") finScore += 30;
    else if (loan === "active") finScore += 20;
    else if (loan === "none") finScore += 25;
    else if (loan === "default" || loan === "defaulted") finScore += 0;
    if (loan) finParts.push(loan.replace("_", " "));
  }
  finScore = clamp(finScore);
  const finDetail = finParts.length ? finParts.join(" · ") : "No financial data";

  // 6. Profile Verification — KYC strength
  let verifScore = 0;
  if (profile?.full_name && profile?.phone) verifScore += 25;
  if (farmProfile?.region && farmProfile?.district) verifScore += 15;
  if (farmProfile?.coordinates_latitude && farmProfile?.coordinates_longitude) verifScore += 15;
  const verifiedDocs = documents.filter((d) => d.status === "verified").length;
  verifScore += Math.min(verifiedDocs * 15, 45);
  verifScore = clamp(verifScore);
  const verifDetail = `${verifiedDocs} verified doc(s)`;

  const breakdown: ScoreBreakdown[] = [
    { key: "yieldHistory", label: "Yield History", score: yieldScore, weight: WEIGHTS.yieldHistory, weighted: yieldScore * WEIGHTS.yieldHistory, detail: yieldDetail },
    { key: "yieldGrowth", label: "Yield Growth", score: growthScore, weight: WEIGHTS.yieldGrowth, weighted: growthScore * WEIGHTS.yieldGrowth, detail: growthDetail },
    { key: "farmSize", label: "Farm Size", score: farmSizeScore, weight: WEIGHTS.farmSize, weighted: farmSizeScore * WEIGHTS.farmSize, detail: farmSizeDetail },
    { key: "farmingMethods", label: "Farming Methods", score: methodScore, weight: WEIGHTS.farmingMethods, weighted: methodScore * WEIGHTS.farmingMethods, detail: methodDetail },
    { key: "financialHealth", label: "Financial Health", score: finScore, weight: WEIGHTS.financialHealth, weighted: finScore * WEIGHTS.financialHealth, detail: finDetail },
    { key: "profileVerification", label: "Verification", score: verifScore, weight: WEIGHTS.profileVerification, weighted: verifScore * WEIGHTS.profileVerification, detail: verifDetail },
  ];

  const totalNormalized = breakdown.reduce((s, b) => s + b.weighted, 0); // 0-100
  // Map 0-100 → 300-850
  const score = Math.round(300 + (totalNormalized / 100) * 550);

  let band: CreditScoreResult["band"];
  let bandColor: string;
  if (score < 500) { band = "Poor"; bandColor = "text-destructive"; }
  else if (score < 620) { band = "Fair"; bandColor = "text-kyf-amber"; }
  else if (score < 720) { band = "Good"; bandColor = "text-kyf-amber"; }
  else if (score < 800) { band = "Very Good"; bandColor = "text-primary"; }
  else { band = "Excellent"; bandColor = "text-primary"; }

  const recommendations: string[] = [];
  const sorted = [...breakdown].sort((a, b) => a.score - b.score).slice(0, 3);
  for (const item of sorted) {
    if (item.score >= 80) continue;
    switch (item.key) {
      case "yieldHistory":
        recommendations.push("Record more crop yield history (4+ years strengthens your score)");
        break;
      case "yieldGrowth":
        recommendations.push("Demonstrate consistent year-over-year yield improvements");
        break;
      case "farmSize":
        recommendations.push("Update accurate farm size — larger productive area improves capacity rating");
        break;
      case "farmingMethods":
        recommendations.push("Document sustainable farming methods used per crop");
        break;
      case "financialHealth":
        recommendations.push("Link a bank account and complete financial details");
        break;
      case "profileVerification":
        recommendations.push("Upload identification & land documents for verification");
        break;
    }
  }

  return { score, band, bandColor, breakdown, recommendations };
}
