import { draftFingerprint } from "../lib/records";
import type { LifeMetricDraft } from "../types";
import { isDraft } from "./localRecords";

export const DRAFTS_KEY = "life_metrics_unsaved_drafts_v1";
const STORAGE_VERSION = 1;
const MAX_DRAFT_AGE_MS = 60 * 24 * 60 * 60 * 1_000;

/**
 * An edit in progress that the user has not saved yet. `baseline` is the
 * fingerprint of the version these edits diverged from, so a restored draft
 * knows whether it is still dirty.
 */
export type StoredDraft = {
  draft: LifeMetricDraft;
  baseline: string;
  rowNumber: number | null;
  updatedAt: number;
};

type StoredDrafts = {
  version: typeof STORAGE_VERSION;
  drafts: Record<string, StoredDraft>;
};

const emptyStore = (): StoredDrafts => ({ version: STORAGE_VERSION, drafts: {} });

const isStoredDraft = (value: unknown): value is StoredDraft => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StoredDraft>;
  return (
    isDraft(entry.draft) &&
    typeof entry.baseline === "string" &&
    (entry.rowNumber === null || (typeof entry.rowNumber === "number" && entry.rowNumber > 0)) &&
    typeof entry.updatedAt === "number"
  );
};

export class DraftRepository {
  constructor(
    private readonly storage: Storage = localStorage,
    private readonly now: () => number = Date.now,
  ) {}

  private readStore(): StoredDrafts {
    const raw = this.storage.getItem(DRAFTS_KEY);
    if (!raw) return emptyStore();

    try {
      const parsed = JSON.parse(raw) as Partial<StoredDrafts>;
      if (parsed.version !== STORAGE_VERSION || !parsed.drafts || typeof parsed.drafts !== "object") {
        return emptyStore();
      }
      const oldest = this.now() - MAX_DRAFT_AGE_MS;
      const drafts = Object.fromEntries(
        Object.entries(parsed.drafts).filter(
          ([date, entry]) => isStoredDraft(entry) && entry.draft.date === date && entry.updatedAt > oldest,
        ),
      );
      return { version: STORAGE_VERSION, drafts };
    } catch {
      return emptyStore();
    }
  }

  private writeStore(store: StoredDrafts, keepDate: string): void {
    try {
      this.storage.setItem(DRAFTS_KEY, JSON.stringify(store));
    } catch (error: unknown) {
      // Out of room: the day being edited right now matters more than the rest.
      const entry = store.drafts[keepDate];
      if (!entry || Object.keys(store.drafts).length === 1) throw error;
      this.storage.setItem(
        DRAFTS_KEY,
        JSON.stringify({ version: STORAGE_VERSION, drafts: { [keepDate]: entry } }),
      );
    }
  }

  list(): Record<string, StoredDraft> {
    return this.readStore().drafts;
  }

  get(date: string): StoredDraft | null {
    return this.readStore().drafts[date] ?? null;
  }

  /** Stores unsaved edits, or clears them when the draft matches its baseline. */
  save(draft: LifeMetricDraft, baseline: string, rowNumber: number | null): StoredDraft | null {
    if (draftFingerprint(draft) === baseline) {
      this.remove(draft.date);
      return null;
    }

    const store = this.readStore();
    const entry: StoredDraft = { draft, baseline, rowNumber, updatedAt: this.now() };
    store.drafts[draft.date] = entry;
    this.writeStore(store, draft.date);
    return entry;
  }

  remove(date: string): void {
    const store = this.readStore();
    if (!(date in store.drafts)) return;
    delete store.drafts[date];
    this.writeStore(store, date);
  }
}
