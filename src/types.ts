export const METRIC_KEYS = [
  "discomfort",
  "meditation",
  "diet",
  "exercise",
  "codingCareer",
  "family",
  "socialising",
  "panic",
  "energy",
  "sleep",
  "mood",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  discomfort: "Discomfort",
  meditation: "Meditation",
  diet: "Diet",
  exercise: "Exercise",
  codingCareer: "Coding / career",
  family: "Family",
  socialising: "Socialising",
  panic: "Panic",
  energy: "Energy",
  sleep: "Sleep",
  mood: "Mood",
};

export const QUALITY_VALUES = [
  "Awful",
  "Bad",
  "Fine",
  "Good",
  "Amazing",
] as const;

export type QualityOfDay = (typeof QUALITY_VALUES)[number];
export type JValue = "Y" | "N";

export type LifeMetricRecord = {
  date: string;
  scores: Record<MetricKey, number | "">;
  j: JValue | "";
  quality: QualityOfDay | "";
  notes: string;
};

export type LifeMetricDraft = {
  date: string;
  scores: Record<MetricKey, string>;
  j: JValue | "";
  quality: QualityOfDay | "";
  notes: string;
};

export type LoadedRecord = {
  draft: LifeMetricDraft;
  rowNumber: number | null;
};

export type SaveResult = {
  rowNumber: number;
  created: boolean;
};

export type ValidationErrors = Partial<Record<MetricKey | "date" | "j" | "quality" | "notes", string>>;
