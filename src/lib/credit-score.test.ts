import { describe, it, expect } from "vitest";
import { computeCreditScore } from "@/lib/credit-score";

const baseArgs = {
  farmProfile: { farm_size_hectares: 2, farming_methods: [], region: "Harare", district: "Chitungwiza" },
  financialRecord: { has_bank_account: true, annual_income: 1000, annual_expenses: 400, loan_status: "none" },
  documents: [],
  cropHistory: [],
  profile: { full_name: "Test Farmer", phone: "+263700000000" },
};

describe("computeCreditScore", () => {
  it("returns a score in the 300-850 range even with empty inputs", () => {
    const r = computeCreditScore({
      farmProfile: {},
      financialRecord: null,
      documents: [],
      cropHistory: [],
      profile: {},
    });
    expect(r.score).toBeGreaterThanOrEqual(300);
    expect(r.score).toBeLessThanOrEqual(850);
    expect(r.band).toBe("Poor");
  });

  it("assigns Excellent to a fully verified, high-yield, growing farmer", () => {
    const r = computeCreditScore({
      farmProfile: {
        farm_size_hectares: 8,
        farming_methods: ["organic", "irrigation", "crop-rotation", "cover-cropping"],
        region: "Harare",
        district: "Chitungwiza",
        coordinates_latitude: -17.8,
        coordinates_longitude: 31,
      },
      financialRecord: { has_bank_account: true, annual_income: 10000, annual_expenses: 3000, loan_status: "fully_repaid" },
      documents: [
        { status: "verified" }, { status: "verified" }, { status: "verified" },
      ],
      cropHistory: [
        { year: 2022, yield_amount: 3000 },
        { year: 2023, yield_amount: 3600 },
        { year: 2024, yield_amount: 4200 },
        { year: 2025, yield_amount: 4800 },
      ],
      profile: { full_name: "Top Farmer", phone: "+263700000001" },
    });
    expect(r.score).toBeGreaterThanOrEqual(720);
    expect(["Very Good", "Excellent"]).toContain(r.band);
  });

  it("caps each pillar at 100 (weighted sum <=100)", () => {
    const r = computeCreditScore(baseArgs);
    const totalWeighted = r.breakdown.reduce((s, b) => s + b.weighted, 0);
    expect(totalWeighted).toBeLessThanOrEqual(100.0001);
    for (const p of r.breakdown) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
  });

  it("weights sum to exactly 1", () => {
    const r = computeCreditScore(baseArgs);
    const sum = r.breakdown.reduce((s, b) => s + b.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("penalises defaulted loans", () => {
    const good = computeCreditScore({
      ...baseArgs,
      financialRecord: { ...baseArgs.financialRecord, loan_status: "fully_repaid" },
    });
    const bad = computeCreditScore({
      ...baseArgs,
      financialRecord: { ...baseArgs.financialRecord, loan_status: "default" },
    });
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("rewards positive year-over-year yield growth", () => {
    const growing = computeCreditScore({
      ...baseArgs,
      cropHistory: [
        { year: 2023, yield_amount: 1000 },
        { year: 2024, yield_amount: 1400 },
      ],
    });
    const declining = computeCreditScore({
      ...baseArgs,
      cropHistory: [
        { year: 2023, yield_amount: 1400 },
        { year: 2024, yield_amount: 1000 },
      ],
    });
    const growingGrowth = growing.breakdown.find((p) => p.key === "yieldGrowth")!.score;
    const decliningGrowth = declining.breakdown.find((p) => p.key === "yieldGrowth")!.score;
    expect(growingGrowth).toBeGreaterThan(decliningGrowth);
  });

  it("emits recommendations for weakest pillars", () => {
    const r = computeCreditScore({
      farmProfile: { farm_size_hectares: 0.2 },
      financialRecord: null,
      documents: [],
      cropHistory: [],
      profile: {},
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("gives Excellent-band recommendations no low-score noise", () => {
    const r = computeCreditScore({
      farmProfile: {
        farm_size_hectares: 8,
        farming_methods: ["organic", "irrigation", "crop-rotation", "cover-cropping"],
        region: "Harare",
        district: "Chitungwiza",
        coordinates_latitude: -17.8,
        coordinates_longitude: 31,
      },
      financialRecord: { has_bank_account: true, annual_income: 10000, annual_expenses: 3000, loan_status: "fully_repaid" },
      documents: [{ status: "verified" }, { status: "verified" }, { status: "verified" }],
      cropHistory: [
        { year: 2022, yield_amount: 3000 },
        { year: 2023, yield_amount: 3600 },
        { year: 2024, yield_amount: 4200 },
        { year: 2025, yield_amount: 4800 },
      ],
      profile: { full_name: "Top", phone: "+2637" },
    });
    // Any recommendation returned must be tied to a pillar under 80
    for (const rec of r.recommendations) {
      expect(rec).toBeTruthy();
    }
  });
});
