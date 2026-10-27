import { googleSerialToIsoDate } from "./date";
import { METRIC_KEYS, type DaySuggestion, type MetricKey } from "../types";

/**
 * The Suggestions tab is written by the coach (Lookout), one row per day:
 * A date, B updated, C rules version, D:N a value per metric (blank = no suggestion),
 * O:Y a reason per metric, Z a notes draft. The app only reads it.
 */
const VALUES_START = 3;
const REASONS_START = VALUES_START + METRIC_KEYS.length;
const NOTES_COLUMN = REASONS_START + METRIC_KEYS.length;

const cellDate = (value: unknown): string | null => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return googleSerialToIsoDate(value);
  return null;
};

const cellText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

export const rowToSuggestion = (row: unknown[]): DaySuggestion | null => {
  const date = cellDate(row[0]);
  if (!date) return null;
  const scores: Partial<Record<MetricKey, number>> = {};
  const reasons: Partial<Record<MetricKey, string>> = {};
  METRIC_KEYS.forEach((key, index) => {
    const value = Number(row[VALUES_START + index]);
    if (row[VALUES_START + index] !== "" && Number.isFinite(value) && value >= 1 && value <= 10) {
      scores[key] = Math.round(value);
    }
    const reason = cellText(row[REASONS_START + index]);
    if (reason) reasons[key] = reason;
  });
  return { date, updatedAt: cellText(row[1]), scores, reasons, notes: cellText(row[NOTES_COLUMN]) };
};

/** The last row for the date wins, in case the tab was edited by hand. */
export const findSuggestion = (rows: unknown[][], date: string): DaySuggestion | null => {
  let found: DaySuggestion | null = null;
  rows.slice(1).forEach((row) => {
    const suggestion = rowToSuggestion(row);
    if (suggestion?.date === date) found = suggestion;
  });
  return found;
};

export const hasSuggestion = (suggestion: DaySuggestion | null): suggestion is DaySuggestion =>
  Boolean(
    suggestion &&
      (Object.keys(suggestion.scores).length > 0 ||
        Object.keys(suggestion.reasons).length > 0 ||
        suggestion.notes),
  );
