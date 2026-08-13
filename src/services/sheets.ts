import { isoDateToGoogleSerial } from "../lib/date";
import { createEmptyDraft, recordToFullRow, rowToDraft } from "../lib/records";
import { METRIC_KEYS, type LifeMetricRecord, type LoadedRecord, type SaveResult } from "../types";

const API_ROOT = "https://sheets.googleapis.com/v4/spreadsheets";

export type DateIndex = Map<number, number[]>;

export interface SheetGateway {
  loadDateIndex(): Promise<DateIndex>;
  loadRecord(date: string): Promise<LoadedRecord>;
  updateRecord(rowNumber: number, record: LifeMetricRecord): Promise<SaveResult>;
  appendRecord(record: LifeMetricRecord): Promise<SaveResult>;
  upsertRecord(record: LifeMetricRecord): Promise<SaveResult>;
}

export class SheetsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: "auth" | "permission" | "duplicate" | "network" | "api",
  ) {
    super(message);
    this.name = "SheetsApiError";
  }
}

type GatewayOptions = {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  fetchImpl?: typeof fetch;
};

const quoteSheetName = (sheetName: string): string => `'${sheetName.replaceAll("'", "''")}'`;

const parseApiError = async (response: Response): Promise<SheetsApiError> => {
  let apiMessage = "Google Sheets request failed.";
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    apiMessage = body.error?.message || apiMessage;
  } catch {
    // Keep the stable fallback when the response is not JSON.
  }

  if (response.status === 401) {
    return new SheetsApiError("Your Google session has expired. Reconnect to continue.", 401, "auth");
  }
  if (response.status === 403) {
    return new SheetsApiError(
      "This Google account does not have permission to edit the Life Metrics sheet.",
      403,
      "permission",
    );
  }
  return new SheetsApiError(apiMessage, response.status, "api");
};

const duplicateDateError = (date: string): SheetsApiError =>
  new SheetsApiError(
    `More than one row exists for ${date}. Resolve the duplicate in Google Sheets before saving.`,
    409,
    "duplicate",
  );

export const createSheetsGateway = ({
  accessToken,
  spreadsheetId,
  sheetName,
  fetchImpl = fetch,
}: GatewayOptions): SheetGateway => {
  let cachedDateIndex: DateIndex | null = null;
  let cachedSheetId: number | null = null;

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${API_ROOT}/${encodeURIComponent(spreadsheetId)}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new SheetsApiError(
        "Could not reach Google Sheets. Check your connection and try again.",
        0,
        "network",
      );
    }

    if (!response.ok) throw await parseApiError(response);
    return (await response.json()) as T;
  };

  const valuesPath = (range: string): string =>
    `/values/${encodeURIComponent(`${quoteSheetName(sheetName)}!${range}`)}`;

  const loadDateIndex = async (): Promise<DateIndex> => {
    const result = await request<{ values?: unknown[][] }>(
      `${valuesPath("A:A")}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
    );
    const index: DateIndex = new Map();

    (result.values ?? []).forEach((row, zeroBasedRow) => {
      const value = row[0];
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      const serial = Math.round(value);
      index.set(serial, [...(index.get(serial) ?? []), zeroBasedRow + 1]);
    });

    cachedDateIndex = index;
    return index;
  };

  const rowsForDate = async (date: string, refresh = false): Promise<number[]> => {
    const index = refresh || !cachedDateIndex ? await loadDateIndex() : cachedDateIndex;
    return index.get(isoDateToGoogleSerial(date)) ?? [];
  };

  const loadRecord = async (date: string): Promise<LoadedRecord> => {
    const rows = await rowsForDate(date);
    if (rows.length > 1) throw duplicateDateError(date);
    if (rows.length === 0) return { draft: createEmptyDraft(date), rowNumber: null };

    const rowNumber = rows[0];
    const result = await request<{ values?: unknown[][] }>(
      `${valuesPath(`A${rowNumber}:T${rowNumber}`)}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
    );
    return {
      draft: rowToDraft(date, result.values?.[0] ?? []),
      rowNumber,
    };
  };

  const updateRecord = async (
    rowNumber: number,
    record: LifeMetricRecord,
  ): Promise<SaveResult> => {
    const sheet = quoteSheetName(sheetName);
    await request("/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: [
          {
            range: `${sheet}!B${rowNumber}:M${rowNumber}`,
            majorDimension: "ROWS",
            values: [[...METRIC_KEYS.map((key) => record.scores[key]), record.j]],
          },
          { range: `${sheet}!R${rowNumber}`, values: [[record.quality]] },
          { range: `${sheet}!T${rowNumber}`, values: [[record.notes]] },
        ],
      }),
    });
    return { rowNumber, created: false };
  };

  const getSheetId = async (): Promise<number> => {
    if (cachedSheetId !== null) return cachedSheetId;
    const result = await request<{
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    }>("?fields=sheets.properties(sheetId,title)");
    const sheet = result.sheets?.find((item) => item.properties?.title === sheetName);
    if (sheet?.properties?.sheetId === undefined) {
      throw new SheetsApiError(`Sheet tab “${sheetName}” was not found.`, 404, "api");
    }
    cachedSheetId = sheet.properties.sheetId;
    return cachedSheetId;
  };

  const applyRowStructure = async (rowNumber: number): Promise<void> => {
    const sheetId = await getSheetId();
    const rowRange = { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber };
    await request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { ...rowRange, startColumnIndex: 0, endColumnIndex: 1 },
              cell: {
                userEnteredFormat: {
                  numberFormat: { type: "DATE", pattern: 'dddd", "mmmm" "d", "yyyy' },
                },
              },
              fields: "userEnteredFormat.numberFormat",
            },
          },
          {
            repeatCell: {
              range: { ...rowRange, startColumnIndex: 12, endColumnIndex: 13 },
              cell: {
                dataValidation: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: [{ userEnteredValue: "Y" }, { userEnteredValue: "N" }],
                  },
                  strict: true,
                  showCustomUi: true,
                },
              },
              fields: "dataValidation",
            },
          },
          {
            repeatCell: {
              range: { ...rowRange, startColumnIndex: 17, endColumnIndex: 18 },
              cell: {
                dataValidation: {
                  condition: {
                    type: "ONE_OF_LIST",
                    values: ["Awful", "Bad", "Fine", "Good", "Amazing"].map(
                      (userEnteredValue) => ({ userEnteredValue }),
                    ),
                  },
                  strict: true,
                  showCustomUi: true,
                },
              },
              fields: "dataValidation",
            },
          },
        ],
      }),
    });
  };

  const appendRecord = async (record: LifeMetricRecord): Promise<SaveResult> => {
    const existingRows = await rowsForDate(record.date, true);
    if (existingRows.length > 1) throw duplicateDateError(record.date);
    if (existingRows.length === 1) return updateRecord(existingRows[0], record);

    const appendResult = await request<{ updates?: { updatedRange?: string } }>(
      `${valuesPath("A:T")}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
      {
        method: "POST",
        body: JSON.stringify({
          majorDimension: "ROWS",
          values: [recordToFullRow(record, isoDateToGoogleSerial(record.date))],
        }),
      },
    );

    const updatedRange = appendResult.updates?.updatedRange ?? "";
    const rowMatch = /![A-Z]+(\d+)(?::[A-Z]+\d+)?$/.exec(updatedRange);
    if (!rowMatch) {
      cachedDateIndex = null;
      throw new SheetsApiError("The row was saved, but its location could not be confirmed.", 500, "api");
    }

    const rowNumber = Number(rowMatch[1]);
    await applyRowStructure(rowNumber);
    cachedDateIndex = null;
    return { rowNumber, created: true };
  };

  const upsertRecord = (record: LifeMetricRecord): Promise<SaveResult> => appendRecord(record);

  return { loadDateIndex, loadRecord, updateRecord, appendRecord, upsertRecord };
};
