import { describe, it, expect, vi, beforeEach } from "vitest";
import { observability } from "./observability";

describe("observability shim", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("logs errors locally without throwing", () => {
    expect(() => observability.captureError("boom", new Error("x"), { a: 1 })).not.toThrow();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("logs warnings and info", () => {
    observability.captureWarning("slow", { ms: 2000 });
    observability.captureInfo("hello");
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("isEnabled reflects DSN presence (unset in test env)", () => {
    expect(observability.isEnabled()).toBe(false);
  });
});
