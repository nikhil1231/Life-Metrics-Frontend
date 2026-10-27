import { describe, expect, it, vi } from "vitest";
import { isoDateToGoogleSerial } from "../lib/date";
import { METRIC_KEYS, type LifeMetricRecord } from "../types";
import { createSheetsGateway, SheetsApiError } from "./sheets";

const record: LifeMetricRecord = {
  date: "2026-08-10",
  scores: Object.fromEntries(METRIC_KEYS.map((key, index) => [key, index + 0.5])) as LifeMetricRecord["scores"],
  j: "N",
  quality: "Amazing",
  notes: "Saved notes",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Google Sheets gateway", () => {
  it("loads a date index and selected A:T row", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ values: [[], [isoDateToGoogleSerial(record.date)]] }))
      .mockResolvedValueOnce(
        jsonResponse({ values: [[46244, 3.7, 2, 3, 4, 5, 6, 7, 8, 9, 5, 6.5, "Y", "", "", "", "", "Good", "", "Notes"]] }),
      );
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    const loaded = await gateway.loadRecord(record.date);
    expect(loaded.rowNumber).toBe(2);
    expect(loaded.draft.scores.discomfort).toBe("3.7");
    expect(loaded.draft.notes).toBe("Notes");
    expect(fetchMock.mock.calls[0][0]).toContain("A%3AA");
    expect(fetchMock.mock.calls[1][0]).toContain("A2%3AT2");
  });

  it("updates only active ranges and preserves hidden columns", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    await gateway.updateRecord(42, record);
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(url).toContain("/values:batchUpdate");
    expect(body.data.map((item: { range: string }) => item.range)).toEqual([
      "'Main'!B42:M42",
      "'Main'!R42",
      "'Main'!T42",
    ]);
    expect(JSON.stringify(body)).not.toContain("N42:Q42");
    expect(JSON.stringify(body)).not.toContain("S42");
  });

  it("turns an append race into an update when the date now exists", async () => {
    const values = [[], [isoDateToGoogleSerial(record.date)]];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ values }))
      .mockResolvedValueOnce(jsonResponse({}));
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    const result = await gateway.appendRecord(record);
    expect(result).toEqual({ rowNumber: 2, created: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("values:batchUpdate");
  });

  it("upserts by refreshing the date index instead of trusting a cached row", async () => {
    const values = [[], [], [isoDateToGoogleSerial(record.date)]];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ values }))
      .mockResolvedValueOnce(jsonResponse({}));
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    const result = await gateway.upsertRecord(record);
    expect(result).toEqual({ rowNumber: 3, created: false });
    expect(fetchMock.mock.calls[1][0]).toContain("values:batchUpdate");
  });

  it("appends a complete row and reapplies date and dropdown structure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ values: [[]] }))
      .mockResolvedValueOnce(jsonResponse({ updates: { updatedRange: "Main!A1263:T1263" } }))
      .mockResolvedValueOnce(jsonResponse({ sheets: [{ properties: { sheetId: 0, title: "Main" } }] }))
      .mockResolvedValueOnce(jsonResponse({}));
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    const result = await gateway.appendRecord(record);
    expect(result).toEqual({ rowNumber: 1263, created: true });
    const appendBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(appendBody.values[0]).toHaveLength(20);
    expect(appendBody.values[0].slice(13, 17)).toEqual(["", "", "", ""]);
    expect(appendBody.values[0][18]).toBe("");
    const structureBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(structureBody.requests).toHaveLength(3);
  });

  it("blocks duplicate dates and maps authorization errors", async () => {
    const serial = isoDateToGoogleSerial(record.date);
    const duplicateFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ values: [[], [serial], [serial]] }));
    const duplicateGateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: duplicateFetch });
    await expect(duplicateGateway.loadRecord(record.date)).rejects.toMatchObject({ code: "duplicate" });

    const authFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: { message: "Invalid token" } }, 401));
    const authGateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: authFetch });
    await expect(authGateway.loadDateIndex()).rejects.toEqual(
      expect.objectContaining<Partial<SheetsApiError>>({ code: "auth", status: 401 }),
    );
  });

  it("reads a day's suggestion from the Suggestions tab without writing anything", async () => {
    const header = ["Date", "Updated", "Rules", ...METRIC_KEYS, ...METRIC_KEYS.map((k) => `Why: ${k}`), "Notes"];
    const values = Array(11).fill("");
    const reasons = Array(11).fill("");
    values[METRIC_KEYS.indexOf("sleep")] = 8;
    values[METRIC_KEYS.indexOf("energy")] = 12;   // out of range: ignored
    reasons[METRIC_KEYS.indexOf("sleep")] = "Oura sleep score 82";
    reasons[METRIC_KEYS.indexOf("diet")] = "eating out ×1";
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse({
        values: [
          header,
          ["2026-08-09", "x", "rules-1", ...Array(22).fill(""), "old"],
          ["2026-08-10", "2026-08-10 21:30", "rules-1", ...values, ...reasons, "Climbing 1h30"],
        ],
      }),
    );
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });

    const suggestion = await gateway.loadSuggestion("2026-08-10");
    expect(suggestion).toEqual({
      date: "2026-08-10",
      updatedAt: "2026-08-10 21:30",
      scores: { sleep: 8 },
      reasons: { sleep: "Oura sleep score 82", diet: "eating out ×1" },
      notes: "Climbing 1h30",
    });
    expect(await gateway.loadSuggestion("2026-08-11")).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain(encodeURIComponent("'Suggestions'!A:Z"));
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("treats a missing Suggestions tab as no suggestion", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: { message: "Unable to parse range: 'Suggestions'!A:Z" } }, 400));
    const gateway = createSheetsGateway({ accessToken: "token", spreadsheetId: "sheet", sheetName: "Main", fetchImpl: fetchMock });
    expect(await gateway.loadSuggestion("2026-08-10")).toBeNull();
  });
});
