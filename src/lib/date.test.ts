import { describe, expect, it } from "vitest";

import {
  formatClockTime,
  getTodayInLondon,
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

  it("uses Europe/London around the daylight-saving boundary", () => {
    expect(getTodayInLondon(new Date("2026-03-29T00:30:00Z"))).toBe("2026-03-29");
    expect(getTodayInLondon(new Date("2026-03-29T23:30:00Z"))).toBe("2026-03-30");
  });
});
