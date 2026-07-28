import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("renders header and rows", () => {
    const csv = toCsv(
      [{ a: 1, b: "x" }, { a: 2, b: "y" }],
      [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
      ]
    );
    expect(csv).toBe("A,B\n1,x\n2,y");
  });

  it("escapes cells with commas, quotes and newlines", () => {
    const csv = toCsv(
      [{ v: 'has "quote", and,comma' }, { v: "line\nbreak" }],
      [{ key: "v", header: "V" }]
    );
    expect(csv).toBe('V\n"has ""quote"", and,comma"\n"line\nbreak"');
  });

  it("joins arrays with semicolons and handles null/undefined", () => {
    const csv = toCsv(
      [{ v: ["maize", "beans"] as unknown as string }, { v: null as unknown as string }],
      [{ key: "v", header: "V" }]
    );
    expect(csv).toBe("V\nmaize; beans\n");
  });
});
