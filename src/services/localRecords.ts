import { draftFingerprint } from "../lib/records";
import { METRIC_KEYS, QUALITY_VALUES, type LifeMetricDraft } from "../types";

export const LOCAL_RECORDS_KEY = "life_metrics_local_records_v1";
const STORAGE_VERSION = 1;

export type LocalRecordStatus = "pending" | "synced";

export type LocalRecord = {
  draft: LifeMetricDraft;
  rowNumber: number | null;
  status: LocalRecordStatus;
  revision: number;
  fingerprint: string;
  updatedAt: number;
};

type StoredRecords = {
  version: typeof STORAGE_VERSION;
  records: Record<string, LocalRecord>;
};

const emptyStore = (): StoredRecords => ({ version: STORAGE_VERSION, records: {} });

const isDraft = (value: unknown): value is LifeMetricDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LifeMetricDraft>;
  return (
    typeof draft.date === "string" &&
    typeof draft.scores === "object" &&
    draft.scores !== null &&
    METRIC_KEYS.every((key) => typeof draft.scores?.[key] === "string") &&
    (draft.j === "" || draft.j === "Y" || draft.j === "N") &&
    (draft.quality === "" ||
      (typeof draft.quality === "string" && QUALITY_VALUES.includes(draft.quality as (typeof QUALITY_VALUES)[number]))) &&
    typeof draft.notes === "string"
  );
};

const isLocalRecord = (value: unknown): value is LocalRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LocalRecord>;
  return (
    isDraft(record.draft) &&
    (record.rowNumber === null || (typeof record.rowNumber === "number" && record.rowNumber > 0)) &&
    (record.status === "pending" || record.status === "synced") &&
    typeof record.revision === "number" &&
    typeof record.fingerprint === "string" &&
    typeof record.updatedAt === "number"
  );
};

export class LocalRecordRepository {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly now: () => number = Date.now,
  ) {}

  private readStore(): StoredRecords {
    const raw = this.storage.getItem(LOCAL_RECORDS_KEY);
    if (!raw) return emptyStore();

    try {
      const parsed = JSON.parse(raw) as Partial<StoredRecords>;
      if (parsed.version !== STORAGE_VERSION || !parsed.records || typeof parsed.records !== "object") {
        return emptyStore();
      }
      const records = Object.fromEntries(
        Object.entries(parsed.records).filter(([date, record]) => isLocalRecord(record) && record.draft.date === date),
      );
      return { version: STORAGE_VERSION, records };
    } catch {
      return emptyStore();
    }
  }

  private writeStore(store: StoredRecords): void {
    this.storage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(store));
  }

  list(): Record<string, LocalRecord> {
    return this.readStore().records;
  }

  get(date: string): LocalRecord | null {
    return this.readStore().records[date] ?? null;
  }

  pending(): LocalRecord[] {
    return Object.values(this.readStore().records)
      .filter((record) => record.status === "pending")
      .sort((left, right) => left.updatedAt - right.updatedAt);
  }

  savePending(draft: LifeMetricDraft, rowNumber: number | null): LocalRecord {
    const store = this.readStore();
    const existing = store.records[draft.date];
    const record: LocalRecord = {
      draft,
      rowNumber: rowNumber ?? existing?.rowNumber ?? null,
      status: "pending",
      revision: (existing?.revision ?? 0) + 1,
      fingerprint: draftFingerprint(draft),
      updatedAt: this.now(),
    };
    store.records[draft.date] = record;
    this.writeStore(store);
    return record;
  }

  cacheSynced(draft: LifeMetricDraft, rowNumber: number | null): LocalRecord {
    const store = this.readStore();
    const existing = store.records[draft.date];
    if (existing?.status === "pending") return existing;

    const record: LocalRecord = {
      draft,
      rowNumber,
      status: "synced",
      revision: existing?.revision ?? 0,
      fingerprint: draftFingerprint(draft),
      updatedAt: this.now(),
    };
    store.records[draft.date] = record;
    this.writeStore(store);
    return record;
  }

  markSynced(date: string, revision: number, rowNumber: number): LocalRecord | null {
    const store = this.readStore();
    const existing = store.records[date];
    if (!existing || existing.revision !== revision) return existing ?? null;

    const record: LocalRecord = {
      ...existing,
      rowNumber,
      status: "synced",
      updatedAt: this.now(),
    };
    store.records[date] = record;
    this.writeStore(store);
    return record;
  }
}
