import { describe, it, expect } from "vitest";
import { APP_VERSION, APP_VERSION_LABEL } from "./version";

describe("version", () => {
  it("exposes the raw version", () => {
    expect(APP_VERSION).toBe("2026-01-01T00:00:00.000Z");
  });

  it("formats the version as a readable date/time", () => {
    expect(APP_VERSION_LABEL).toContain("2026");
    expect(APP_VERSION_LABEL).toContain("1");
    expect(APP_VERSION_LABEL).toContain(":");
  });
});
