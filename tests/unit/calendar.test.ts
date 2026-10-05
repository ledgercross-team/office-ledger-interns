import { describe, expect, it } from "vitest";
import { buildIcs, expand, rruleFor } from "@/lib/calendar";

const tz = "Asia/Dhaka";
const base = { id: "m1", title: "Stand-up", durationMin: 15, recurrenceUntil: null };

describe("recurrence", () => {
  it("expands weekly and monthly meetings in the workspace timezone", () => {
    const weekly = expand(
      [{ ...base, startsAt: "2026-10-05T04:15:00Z", recurrence: "weekly" as const }],
      "2026-10-01",
      "2026-10-31",
      tz,
    );
    expect(weekly.map((o) => o.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(weekly[1]!.start.toISOString()).toBe("2026-10-12T04:15:00.000Z");
    const monthly = expand(
      [{ ...base, startsAt: "2026-08-15T04:00:00Z", recurrence: "monthly" as const }],
      "2026-10-01",
      "2026-11-30",
      tz,
    );
    expect(monthly.map((o) => o.date)).toEqual(["2026-10-15", "2026-11-15"]);
  });
  it("skips weekend days for daily meetings", () => {
    const daily = expand(
      [{ ...base, startsAt: "2026-10-01T04:00:00Z", recurrence: "daily" as const }],
      "2026-10-01",
      "2026-10-07",
      tz,
      [5, 6],
    );
    expect(daily.map((o) => o.date)).toEqual([
      "2026-10-01",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(rruleFor("daily", null, [5, 6])).toBe("FREQ=DAILY;BYDAY=SU,MO,TU,WE,TH");
  });
  it("respects the until date", () => {
    const daily = expand(
      [
        {
          ...base,
          startsAt: "2026-10-01T04:00:00Z",
          recurrence: "daily" as const,
          recurrenceUntil: "2026-10-03",
        },
      ],
      "2026-10-01",
      "2026-10-10",
      tz,
    );
    expect(daily).toHaveLength(3);
  });
});

describe("ics", () => {
  it("builds a valid calendar with all-day and recurring events", () => {
    const ics = buildIcs("Test", [
      { uid: "a@x", title: "Retreat, day; one", allDay: { start: "2026-10-17", end: "2026-10-17" } },
      {
        uid: "b@x",
        title: "Stand-up",
        start: new Date("2026-10-05T04:15:00Z"),
        end: new Date("2026-10-05T04:30:00Z"),
        rrule: rruleFor("weekly", "2026-12-31"),
      },
    ]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261017");
    expect(ics).toContain("DTEND;VALUE=DATE:20261018");
    expect(ics).toContain("SUMMARY:Retreat\\, day\\; one");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261231T235959Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
