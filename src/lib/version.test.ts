import { describe, it, expect, vi, beforeAll } from "vitest";
import { APP_VERSION } from "./version";

const TEST_VERSION = "2026-01-01T00:00:00.000Z";

vi.stubGlobal("__APP_VERSION__", TEST_VERSION);

// Re-import after stubbing the global so the module reads the mocked value.
const { APP_VERSION_LABEL } = await import("./version");

describe("version", () => {
  it("exposes the raw version", () => {
    expect(APP_VERSION).toBe(TEST_VERSION);
  });

  it("formats the version as a readable date/time", () => {
    expect(APP_VERSION_LABEL).toContain("2026");
    expect(APP_VERSION_LABEL).toContain("1");
    expect(APP_VERSION_LABEL).toContain(":");
  });
});
