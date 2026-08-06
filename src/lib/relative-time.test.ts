import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { relativeTime, daysSince } from "./relative-time";

const NOW = new Date("2026-07-28T12:00:00Z").getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("relativeTime", () => {
  it("returns empty string for missing / invalid input", () => {
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(undefined)).toBe("");
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("buckets recent times", () => {
    expect(relativeTime(iso(10_000))).toBe("just now");
    expect(relativeTime(iso(60_000))).toBe("1 min ago");
    expect(relativeTime(iso(5 * 60_000))).toBe("5 min ago");
    expect(relativeTime(iso(2 * 3600_000))).toBe("2h ago");
    expect(relativeTime(iso(3 * 86400_000))).toBe("3d ago");
  });

  it("buckets long-past times", () => {
    expect(relativeTime(iso(14 * 86400_000))).toBe("2w ago");
    expect(relativeTime(iso(90 * 86400_000))).toBe("3mo ago");
    expect(relativeTime(iso(2 * 365 * 86400_000))).toBe("2y ago");
  });
});

describe("daysSince", () => {
  it("returns 0 for missing/invalid", () => {
    expect(daysSince(null)).toBe(0);
    expect(daysSince("bad")).toBe(0);
  });

  it("returns floor of day diff", () => {
    expect(daysSince(iso(3 * 86400_000 + 3600_000))).toBe(3);
  });
});
