import { describe, expect, it } from "vitest";
import { createEmptyDraft, recordToFullRow, rowToDraft, validateDraft } from "./records";
import { METRIC_KEYS, type LifeMetricRecord } from "../types";

const validRecord: LifeMetricRecord = {
  date: "2026-08-10",
  scores: Object.fromEntries(METRIC_KEYS.map((key, index) => [key, index === 0 ? 3.7 : 6])) as LifeMetricRecord["scores"],
  j: "Y",
  quality: "Good",
  notes: "A useful day.",
};

describe("Life Metrics row model", () => {
  it("parses decimals and normalizes trailing blank cells", () => {
    const row = [46244, 3.7, 5, 6, 7, 8, 9, 4, 3, 5, 6, 6.5, "N"];
    const draft = rowToDraft("2026-08-10", row);

    expect(draft.scores.discomfort).toBe("3.7");
    expect(draft.scores.mood).toBe("6.5");
    expect(draft.j).toBe("N");
    expect(draft.quality).toBe("");
    expect(draft.notes).toBe("");
  });

  it("serializes exactly twenty columns with hidden columns blank", () => {
    const row = recordToFullRow(validRecord, 46244);
    expect(row).toHaveLength(20);
    expect(row.slice(13, 17)).toEqual(["", "", "", ""]);
    expect(row[17]).toBe("Good");
    expect(row[18]).toBe("");
    expect(row[19]).toBe("A useful day.");
  });

  it("validates every visible field and accepts decimals", () => {
    const draft = createEmptyDraft("2026-08-10");
    METRIC_KEYS.forEach((key) => {
      draft.scores[key] = "4.25";
    });
    draft.j = "Y";
    draft.quality = "Amazing";
    draft.notes = "  Detailed notes.  ";

    const result = validateDraft(draft);
    expect(result.errors).toEqual({});
    expect(result.record?.scores.panic).toBe(4.25);
    expect(result.record?.notes).toBe("Detailed notes.");
  });

  it("rejects blank, non-numeric, and out-of-range values", () => {
    const draft = createEmptyDraft("bad-date");
    draft.scores.discomfort = "0";
    draft.scores.meditation = "11";
    draft.scores.diet = "nope";
    const result = validateDraft(draft);

    expect(result.record).toBeNull();
    expect(result.errors.date).toBeDefined();
    expect(result.errors.discomfort).toBeDefined();
    expect(result.errors.meditation).toBeDefined();
    expect(result.errors.diet).toBeDefined();
    expect(result.errors.notes).toBeDefined();
  });
});
