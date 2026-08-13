import { describe, expect, it } from "vitest";
import { parseNotes, serializeNotes } from "./notes";

describe("notes structure", () => {
  it("keeps a legacy paragraph as a body-only moment", () => {
    expect(parseNotes("A long stream of consciousness with no line break.")).toEqual([
      { title: "", body: "A long stream of consciousness with no line break." },
    ]);
  });

  it("reads existing newline-formatted notes", () => {
    expect(parseNotes("Morning chores\nCleared the drain.\n\nMuseum date\nSaw the Greek rooms.")).toEqual([
      { title: "Morning chores", body: "Cleared the drain." },
      { title: "Museum date", body: "Saw the Greek rooms." },
    ]);
  });

  it("round trips titled and body-only moments as plain text", () => {
    const moments = [
      { title: "Garden party", body: "Expected a small BBQ." },
      { title: "", body: "Went home and decompressed." },
    ];

    expect(parseNotes(serializeNotes(moments))).toEqual(moments);
    expect(serializeNotes(moments)).toBe(
      "Garden party — Expected a small BBQ. // Went home and decompressed.",
    );
  });

  it("reads em-dash titles and double-slash moment separators", () => {
    expect(parseNotes("Museum — Saw the Greek rooms. // Went home.")).toEqual([
      { title: "Museum", body: "Saw the Greek rooms." },
      { title: "", body: "Went home." },
    ]);
  });

  it("flattens line breaks so the spreadsheet cell stays on one line", () => {
    expect(serializeNotes([{ title: "Museum", body: "First line.\nSecond line." }])).toBe(
      "Museum — First line. Second line.",
    );
  });
});
