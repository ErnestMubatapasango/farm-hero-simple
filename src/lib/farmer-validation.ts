/**
 * Farmer data bounds — kept in sync with the database CHECK constraints and
 * the re-checks inside the public.save_farmer RPC.
 */
export const FARM_SIZE_MIN_EXCLUSIVE = 0;
export const FARM_SIZE_MAX = 100000;
export const FARM_SIZE_STEP = 0.01;

export const ANNUAL_INCOME_MIN = 0;
export const ANNUAL_INCOME_MAX = 1_000_000_000;
export const ANNUAL_INCOME_STEP = 0.01;

export const YIELD_YEAR_MIN = 1980;
export const AGE_MIN = 18;
export const AGE_MAX = 120;

const isBlank = (v: string | null | undefined) => v == null || String(v).trim() === "";

/** Zimbabwe national ID, e.g. 63-1234567A63. Must match the database constraint. */
export const NATIONAL_ID_PATTERN = /^[0-9]{2}-[0-9]{6,7}[A-Z][0-9]{2}$/;
export const NATIONAL_ID_EXAMPLE = "63-1234567A63";

/** Uppercase + strip whitespace, mirroring public.normalize_national_id. */
export function normalizeNationalId(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s/g, "").toUpperCase();
}

/** National ID is required and must match the Zimbabwe format. */
export function validateNationalId(value: string): string | null {
  const nid = normalizeNationalId(value);
  if (nid === "") return "National ID is required.";
  if (!NATIONAL_ID_PATTERN.test(nid)) {
    return `Enter a valid national ID, e.g. ${NATIONAL_ID_EXAMPLE}.`;
  }
  return null;
}

/** Farm size is optional, but when supplied must be > 0 and <= 100000. */
export function validateFarmSize(value: string): string | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Enter a valid number of hectares.";
  if (n <= FARM_SIZE_MIN_EXCLUSIVE) return "Farm size must be greater than 0 hectares.";
  if (n > FARM_SIZE_MAX) return `Farm size cannot exceed ${FARM_SIZE_MAX.toLocaleString()} hectares.`;
  return null;
}

/** Annual income is optional, but when supplied must be between 0 and 1,000,000,000. */
export function validateAnnualIncome(value: string): string | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Enter a valid amount.";
  if (n < ANNUAL_INCOME_MIN) return "Annual income cannot be negative.";
  if (n > ANNUAL_INCOME_MAX) return `Annual income cannot exceed ${ANNUAL_INCOME_MAX.toLocaleString()}.`;
  return null;
}

/** Date of birth is optional, but when supplied must be in the past and imply age 18–120. */
export function validateDateOfBirth(value: string): string | null {
  if (isBlank(value)) return null;
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "Enter a valid date of birth.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dob >= today) return "Date of birth must be in the past.";

  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;

  if (age < AGE_MIN) return `Farmer must be at least ${AGE_MIN} years old.`;
  if (age > AGE_MAX) return `Age cannot exceed ${AGE_MAX} years — please check the date.`;
  return null;
}

/** Latest date of birth that still satisfies the minimum age (for input max=). */
export function maxDateOfBirth(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - AGE_MIN);
  return d.toISOString().slice(0, 10);
}

/** Earliest date of birth that still satisfies the maximum age (for input min=). */
export function minDateOfBirth(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - AGE_MAX);
  return d.toISOString().slice(0, 10);
}

/** Yield in kg is optional, but when supplied must be >= 0. */
export function validateYieldKg(value: string): string | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Enter a valid yield in kg.";
  if (n < 0) return "Yield cannot be negative.";
  return null;
}

/** Revenue is optional, but when supplied must be >= 0. */
export function validateRevenue(value: string): string | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "Enter a valid revenue amount.";
  if (n < 0) return "Revenue cannot be negative.";
  return null;
}

/** Yield year must be between 1980 and the current year. */
export function validateYieldYear(year: number): string | null {
  const thisYear = new Date().getFullYear();
  if (year < YIELD_YEAR_MIN || year > thisYear) {
    return `Year must be between ${YIELD_YEAR_MIN} and ${thisYear}.`;
  }
  return null;
}

export interface YieldEntryLike {
  yield: string;
  revenue: string;
}

/**
 * Validates every yield-history entry keyed as `${crop}_${year}`.
 * Returns a map of `${crop}_${year}.yield` / `.revenue` / `.year` -> message.
 */
export function validateYieldHistory(
  history: Record<string, YieldEntryLike>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, entry] of Object.entries(history)) {
    if (!entry) continue;
    const year = Number(key.slice(key.lastIndexOf("_") + 1));
    if (Number.isFinite(year)) {
      const yearErr = validateYieldYear(year);
      if (yearErr) errors[`${key}.year`] = yearErr;
    }
    const yieldErr = validateYieldKg(entry.yield);
    if (yieldErr) errors[`${key}.yield`] = yieldErr;
    const revErr = validateRevenue(entry.revenue);
    if (revErr) errors[`${key}.revenue`] = revErr;
  }
  return errors;
}
