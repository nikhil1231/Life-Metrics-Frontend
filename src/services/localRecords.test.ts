import { describe, expect, it } from "vitest";
import { createEmptyDraft } from "../lib/records";
import { LOCAL_RECORDS_KEY, LocalRecordRepository } from "./localRecords";

describe("local record repository", () => {
  it("stores multiple dates and replaces a pending date with a newer revision", () => {
    let now = 10;
    const repository = new LocalRecordRepository(localStorage, () => now++);
    const first = createEmptyDraft("2026-08-10");
    const second = createEmptyDraft("2026-08-11");
    first.notes = "first";
    second.notes = "second";

    expect(repository.savePending(first, null).revision).toBe(1);
    repository.savePending(second, null);
    first.notes = "edited";
    expect(repository.savePending(first, null).revision).toBe(2);
    expect(repository.pending()).toHaveLength(2);
    expect(repository.get(first.date)?.draft.notes).toBe("edited");
  });

  it("does not mark a newer revision synced when an older request finishes", () => {
    const repository = new LocalRecordRepository(localStorage, () => 10);
    const draft = createEmptyDraft("2026-08-10");
    const first = repository.savePending(draft, null);
    draft.notes = "newer";
    const second = repository.savePending(draft, null);

    repository.markSynced(draft.date, first.revision, 42);
    expect(repository.get(draft.date)?.status).toBe("pending");
    repository.markSynced(draft.date, second.revision, 42);
    expect(repository.get(draft.date)?.status).toBe("synced");
  });

  it("ignores malformed or unsupported stored versions", () => {
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify({ version: 99, records: { bad: true } }));
    expect(new LocalRecordRepository().list()).toEqual({});
    localStorage.setItem(LOCAL_RECORDS_KEY, "not-json");
    expect(new LocalRecordRepository().list()).toEqual({});
  });

  it("surfaces local storage write failures", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("Storage is full."); },
    } as unknown as Storage;
    const repository = new LocalRecordRepository(storage);
    expect(() => repository.savePending(createEmptyDraft("2026-08-10"), null)).toThrow("Storage is full.");
  });
});
