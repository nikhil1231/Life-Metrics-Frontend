import { describe, expect, it } from "vitest";
import { createEmptyDraft, draftFingerprint } from "../lib/records";
import { DRAFTS_KEY, DraftRepository } from "./draftStore";

const dirtyDraft = (date: string, notes: string) => {
  const draft = createEmptyDraft(date);
  draft.notes = notes;
  return draft;
};

describe("draft repository", () => {
  it("keeps unsaved edits per date and returns them with their baseline", () => {
    const repository = new DraftRepository(localStorage, () => 1_000);
    const draft = dirtyDraft("2026-08-10", "in progress");
    const baseline = draftFingerprint(createEmptyDraft("2026-08-10"));

    repository.save(draft, baseline, 42);
    repository.save(dirtyDraft("2026-08-11", "other day"), baseline, null);

    const restored = repository.get("2026-08-10");
    expect(restored?.draft.notes).toBe("in progress");
    expect(restored?.baseline).toBe(baseline);
    expect(restored?.rowNumber).toBe(42);
    expect(restored?.updatedAt).toBe(1_000);
    expect(Object.keys(repository.list())).toHaveLength(2);
  });

  it("clears the entry when the draft matches its baseline again", () => {
    const repository = new DraftRepository();
    const draft = dirtyDraft("2026-08-10", "typed then undone");
    const baseline = draftFingerprint(createEmptyDraft("2026-08-10"));

    repository.save(draft, baseline, null);
    expect(repository.save(createEmptyDraft("2026-08-10"), baseline, null)).toBeNull();
    expect(repository.get("2026-08-10")).toBeNull();
  });

  it("drops entries older than the retention window and malformed stores", () => {
    const stale = { version: 1, drafts: { "2020-01-01": { draft: createEmptyDraft("2020-01-01"), baseline: "", rowNumber: null, updatedAt: 0 } } };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(stale));
    expect(new DraftRepository().list()).toEqual({});

    localStorage.setItem(DRAFTS_KEY, "not-json");
    expect(new DraftRepository().list()).toEqual({});

    localStorage.setItem(DRAFTS_KEY, JSON.stringify({ version: 99, drafts: {} }));
    expect(new DraftRepository().list()).toEqual({});
  });

  it("sacrifices other days to keep the day being edited when storage is full", () => {
    const values = new Map<string, string>();
    let full = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full && value.length > 900) throw new Error("Storage is full.");
        values.set(key, value);
      },
    } as unknown as Storage;

    const repository = new DraftRepository(storage, () => 1_000);
    const baseline = draftFingerprint(createEmptyDraft("2026-08-10"));
    repository.save(dirtyDraft("2026-08-09", "old day"), baseline, null);
    full = true;
    repository.save(dirtyDraft("2026-08-10", "today"), baseline, null);

    expect(Object.keys(repository.list())).toEqual(["2026-08-10"]);
  });

  it("propagates the failure when even a single day cannot be stored", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("Storage is full."); },
    } as unknown as Storage;
    const repository = new DraftRepository(storage);
    expect(() => repository.save(dirtyDraft("2026-08-10", "today"), "baseline", null)).toThrow(
      "Storage is full.",
    );
  });
});
