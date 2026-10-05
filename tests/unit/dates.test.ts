import { describe, expect, it } from "vitest";
import { localDate, tenure, zoned, fmtMinutes, eachDay } from "@/lib/dates";

describe("dates", () => {
  it("converts between local wall time and UTC", () => {
    expect(zoned("Asia/Dhaka", "2025-03-02", "10:00").toISOString()).toBe("2025-03-02T04:00:00.000Z");
    expect(localDate("Asia/Dhaka", new Date("2025-03-10T20:00:00Z"))).toBe("2025-03-11");
  });
  it("formats tenure", () => {
    expect(tenure("2025-01-01", "2025-10-04")).toBe("9 months 3 days");
    expect(tenure("2023-10-04", "2025-10-04")).toBe("2 years 0 days");
  });
  it("formats minutes and ranges", () => {
    expect(fmtMinutes(125)).toBe("2h 05m");
    expect(eachDay("2025-02-27", "2025-03-02")).toHaveLength(4);
  });
});
