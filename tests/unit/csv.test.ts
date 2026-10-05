import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("escapes quotes, commas and formula prefixes", () => {
    expect(toCsv(["a", "b"], [['x,"y"', "=SUM(A1)"]])).toBe('a,b\r\n"x,""y""",\'=SUM(A1)');
  });
  it("round-trips through the parser", () => {
    const rows = parseCsv('name,email\r\n"Doe, Jane",jane@x.test\nBob,"b""ob@x.test"\n');
    expect(rows).toEqual([["name", "email"], ["Doe, Jane", "jane@x.test"], ["Bob", 'b"ob@x.test']]);
  });
});
