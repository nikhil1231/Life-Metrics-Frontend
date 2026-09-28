import { describe, expect, it } from "vitest";

import {
  formatClockTime,
  getToday,
  googleSerialToIsoDate,
  isValidIsoDate,
  isoDateToGoogleSerial,
} from "./date";

describe("Google Sheets date conversion", () => {
  it("round-trips regular and leap dates", () => {
    for (const date of ["2026-08-10", "2024-02-29", "1900-01-01"]) {
      expect(googleSerialToIsoDate(isoDateToGoogleSerial(date))).toBe(date);
    }
  });

  it("matches the serial used by the live sheet", () => {
    expect(isoDateToGoogleSerial("2026-08-10")).toBe(46244);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("10/08/2026")).toBe(false);
    expect(() => isoDateToGoogleSerial("not-a-date")).toThrow("Invalid ISO date");
  });

  it("formats an autosave timestamp as a 24-hour clock time", () => {
    expect(formatClockTime(Date.UTC(2026, 7, 10, 14, 32))).toMatch(/^\d{2}:\d{2}$/);
  });

  it("rolls the day over at 06:00 local time, not midnight", () => {
    expect(getToday(new Date(2026, 7, 11, 0, 30))).toBe("2026-08-10");
    expect(getToday(new Date(2026, 7, 11, 5, 59))).toBe("2026-08-10");
    expect(getToday(new Date(2026, 7, 11, 6, 0))).toBe("2026-08-11");
    expect(getToday(new Date(2026, 0, 1, 2, 0))).toBe("2025-12-31");
    expect(getToday(new Date(2026, 2, 1, 3, 0))).toBe("2026-02-28");
  });
});
