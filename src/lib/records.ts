import { isValidIsoDate } from "./date";
import { parseNotes, serializeNotes } from "./notes";
import {
  METRIC_KEYS,
  QUALITY_VALUES,
  type LifeMetricDraft,
  type LifeMetricRecord,
  type MetricKey,
  type QualityOfDay,
  type ValidationErrors,
} from "../types";

export const createEmptyDraft = (date: string): LifeMetricDraft => ({
  date,
  scores: Object.fromEntries(METRIC_KEYS.map((key) => [key, ""])) as Record<MetricKey, string>,
  j: "",
  quality: "",
  notes: "",
});

export const rowToDraft = (date: string, row: unknown[]): LifeMetricDraft => {
  const cells = Array.from({ length: 20 }, (_, index) => row[index] ?? "");
  const draft = createEmptyDraft(date);

  METRIC_KEYS.forEach((key, index) => {
    const value = cells[index + 1];
    draft.scores[key] = typeof value === "number" || typeof value === "string" ? String(value) : "";
  });

  draft.j = cells[12] === "Y" || cells[12] === "N" ? cells[12] : "";
  draft.quality = QUALITY_VALUES.includes(cells[17] as QualityOfDay)
    ? (cells[17] as QualityOfDay)
    : "";
  draft.notes = typeof cells[19] === "string" ? cells[19] : String(cells[19] ?? "");
  return draft;
};

export const validateDraft = (
  draft: LifeMetricDraft,
): { record: LifeMetricRecord | null; errors: ValidationErrors } => {
  const errors: ValidationErrors = {};
  const scores = {} as Record<MetricKey, number | "">;

  if (!isValidIsoDate(draft.date)) errors.date = "Choose a valid date.";

  METRIC_KEYS.forEach((key) => {
    const rawValue = draft.scores[key].trim();
    if (rawValue === "") {
      scores[key] = "";
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      errors[key] = "Enter a number from 1 to 10.";
      return;
    }
    scores[key] = value;
  });

  if (Object.keys(errors).length > 0) return { record: null, errors };

  return {
    record: {
      date: draft.date,
      scores,
      j: draft.j,
      quality: draft.quality,
      notes: serializeNotes(parseNotes(draft.notes)),
    },
    errors,
  };
};

export const recordToFullRow = (record: LifeMetricRecord, dateSerial: number): unknown[] => [
  dateSerial,
  ...METRIC_KEYS.map((key) => record.scores[key]),
  record.j,
  "",
  "",
  "",
  "",
  record.quality,
  "",
  record.notes,
];

export const draftFingerprint = (draft: LifeMetricDraft): string => JSON.stringify(draft);
