import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MetricField } from "./components/MetricField";
import { NotesField } from "./components/NotesField";
import { SegmentedControl } from "./components/SegmentedControl";
import { APP_CONFIG } from "./config";
import { formatClockTime, formatDisplayDate, getTodayInLondon } from "./lib/date";
import { createEmptyDraft, draftFingerprint, validateDraft } from "./lib/records";
import { useGoogleAuth } from "./services/auth";
import { DraftRepository } from "./services/draftStore";
import { LOCAL_RECORDS_KEY, LocalRecordRepository } from "./services/localRecords";
import { createSheetsGateway, SheetsApiError } from "./services/sheets";
import {
  METRIC_KEYS,
  METRIC_LABELS,
  QUALITY_VALUES,
  type JValue,
  type LifeMetricDraft,
  type MetricKey,
  type QualityOfDay,
  type ValidationErrors,
} from "./types";

type DataStatus = "idle" | "loading" | "saving" | "saved" | "pending" | "syncing" | "error";

/** How often unsaved edits are written to this device while typing. */
const AUTOSAVE_INTERVAL_MS = 3_000;

const STORAGE_BLOCKED_MESSAGE =
  "This device is blocking local saves, so unsaved edits are only held in this tab. Save before you close it.";

const recordAsDraft = (
  record: NonNullable<ReturnType<typeof validateDraft>["record"]>,
): LifeMetricDraft => ({
  date: record.date,
  scores: Object.fromEntries(
    METRIC_KEYS.map((key) => [key, String(record.scores[key])]),
  ) as LifeMetricDraft["scores"],
  j: record.j,
  quality: record.quality,
  notes: record.notes,
});

const App = () => {
  const auth = useGoogleAuth(APP_CONFIG.googleClientId);
  const localRepository = useMemo(() => new LocalRecordRepository(), []);
  const draftRepository = useMemo(() => new DraftRepository(), []);
  const today = getTodayInLondon();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [localRecords, setLocalRecords] = useState(() => localRepository.list());
  const [selectedDate, setSelectedDate] = useState(today);
  const [draft, setDraft] = useState<LifeMetricDraft>(() => createEmptyDraft(today));
  const [baseline, setBaseline] = useState(() => draftFingerprint(createEmptyDraft(today)));
  const [rowNumber, setRowNumber] = useState<number | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingNotesDate, setEditingNotesDate] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const syncRunningRef = useRef(false);
  const silentReconnectAttemptedRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const hydratedDateRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const rowNumberRef = useRef(rowNumber);
  const isDirtyRef = useRef(false);

  const gateway = useMemo(() => {
    if (!auth.accessToken || APP_CONFIG.errors.length > 0) return null;
    return createSheetsGateway({
      accessToken: auth.accessToken,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      sheetName: APP_CONFIG.sheetName,
    });
  }, [auth.accessToken]);

  const isDirty = draftFingerprint(draft) !== baseline;
  const selectedLocalRecord = localRecords[selectedDate] ?? null;
  const pendingCount = Object.values(localRecords).filter((record) => record.status === "pending").length;
  const canUseApp = auth.status === "authenticated" || auth.hasAuthorizedBefore;

  useEffect(() => {
    draftRef.current = draft;
    baselineRef.current = baseline;
    rowNumberRef.current = rowNumber;
    isDirtyRef.current = isDirty;
  });

  const refreshLocalRecords = useCallback(() => {
    setLocalRecords(localRepository.list());
  }, [localRepository]);

  const cancelScheduledAutosave = useCallback(() => {
    if (autosaveTimerRef.current === null) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  /** Writes the current unsaved edits to this device, or clears them if there are none. */
  const persistDraft = useCallback(() => {
    cancelScheduledAutosave();
    try {
      const entry = draftRepository.save(draftRef.current, baselineRef.current, rowNumberRef.current);
      setDraftSavedAt(entry?.updatedAt ?? null);
      setStorageBlocked(false);
    } catch {
      setStorageBlocked(true);
    }
  }, [cancelScheduledAutosave, draftRepository]);

  const forgetDraft = useCallback(
    (date: string) => {
      cancelScheduledAutosave();
      try {
        draftRepository.remove(date);
      } catch {
        // Nothing more to do: the sheet already has this day.
      }
      setDraftSavedAt(null);
      setRestoredAt(null);
    },
    [cancelScheduledAutosave, draftRepository],
  );

  const handleSheetsError = useCallback(
    (error: unknown) => {
      if (error instanceof SheetsApiError && error.code === "auth") auth.markExpired();
      setDataStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Something went wrong while contacting Google Sheets.",
      );
    },
    [auth.markExpired],
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncPendingRecords = useCallback(async () => {
    if (!gateway || !isOnline || syncRunningRef.current) return;
    syncRunningRef.current = true;

    try {
      let pendingBatch = localRepository.pending();
      while (pendingBatch.length > 0) {
        for (const pending of pendingBatch) {
          setDataStatus("syncing");
          setStatusMessage(`Syncing ${formatDisplayDate(pending.draft.date)}…`);
          const { record } = validateDraft(pending.draft);
          if (!record) {
            throw new Error(
              `Saved data for ${formatDisplayDate(pending.draft.date)} is invalid and could not sync.`,
            );
          }

          let attempt = 0;
          while (true) {
            try {
              const result = await gateway.upsertRecord(record);
              localRepository.markSynced(pending.draft.date, pending.revision, result.rowNumber);
              refreshLocalRecords();
              break;
            } catch (error: unknown) {
              const retryable =
                error instanceof SheetsApiError &&
                (error.code === "network" || (error.code === "api" && error.status >= 500));
              if (!retryable || attempt >= 2) throw error;
              await new Promise((resolve) =>
                window.setTimeout(resolve, [500, 1_500, 4_000][attempt++]),
              );
            }
          }
        }
        const revisions = new Map(pendingBatch.map((item) => [item.draft.date, item.revision]));
        pendingBatch = localRepository
          .pending()
          .filter((item) => revisions.get(item.draft.date) !== item.revision);
      }

      refreshLocalRecords();
      setDataStatus("saved");
      setStatusMessage("All saved days are synced.");
    } catch (error: unknown) {
      handleSheetsError(error);
    } finally {
      syncRunningRef.current = false;
    }
  }, [gateway, handleSheetsError, isOnline, localRepository, refreshLocalRecords]);

  useEffect(() => {
    if (auth.status === "authenticated" && gateway && isOnline && pendingCount > 0) {
      void syncPendingRecords();
    }
  }, [auth.status, gateway, isOnline, pendingCount, syncPendingRecords]);

  useEffect(() => {
    if (auth.status === "authenticated") {
      silentReconnectAttemptedRef.current = false;
      return;
    }
    if (
      auth.status === "expired" &&
      auth.isGoogleReady &&
      isOnline &&
      !silentReconnectAttemptedRef.current
    ) {
      silentReconnectAttemptedRef.current = true;
      auth.connect();
    }
  }, [auth.status, auth.isGoogleReady, auth.connect, isOnline]);

  useEffect(() => {
    if (!canUseApp) return;
    let active = true;

    const stashed = draftRepository.get(selectedDate);
    const local = localRepository.get(selectedDate);
    // This effect re-runs whenever the token refreshes or connectivity flips, so
    // it must never overwrite edits the user has in front of them.
    const hasUnsavedEdits = Boolean(stashed) || isDirtyRef.current;
    const isNewDate = hydratedDateRef.current !== selectedDate;

    if (isNewDate) {
      hydratedDateRef.current = selectedDate;
      setFieldErrors({});
      if (stashed) {
        setDraft(stashed.draft);
        setBaseline(stashed.baseline);
        setRowNumber(stashed.rowNumber ?? local?.rowNumber ?? null);
        setDraftSavedAt(stashed.updatedAt);
        setRestoredAt(stashed.updatedAt);
        // Notes for a past day open in reading mode; a restored edit stays editable.
        if (stashed.draft.notes.trim().length > 0) setEditingNotesDate(selectedDate);
      } else {
        const nextDraft = local?.draft ?? createEmptyDraft(selectedDate);
        setDraft(nextDraft);
        setBaseline(draftFingerprint(nextDraft));
        setRowNumber(local?.rowNumber ?? null);
        setDraftSavedAt(null);
        setRestoredAt(null);
      }
    }

    if (local?.status === "pending" || !gateway || !isOnline) {
      setDataStatus(local?.status === "pending" ? "pending" : "idle");
      if (!hasUnsavedEdits) {
        setStatusMessage(
          local?.status === "pending"
            ? !isOnline
              ? "Saved on this device · waiting to sync"
              : !gateway
                ? "Saved on this device · reconnect Google to sync"
                : "Saved on this device · waiting to sync"
            : !isOnline
              ? "Offline · using data on this device"
              : "On-device data · reconnect Google to refresh",
        );
      }
      return;
    }

    // Only block the form behind a spinner on a genuinely cold load; a refresh
    // that happens while the user is editing stays in the background.
    if (isNewDate && !hasUnsavedEdits) {
      setDataStatus("loading");
      setStatusMessage(null);
    }

    gateway
      .loadRecord(selectedDate)
      .then((loaded) => {
        if (!active) return;
        const cached = localRepository.cacheSynced(loaded.draft, loaded.rowNumber);
        refreshLocalRecords();
        setRowNumber(cached.rowNumber);
        if (isDirtyRef.current) {
          setDataStatus((current) => (current === "loading" ? "idle" : current));
          return;
        }
        setDraft(cached.draft);
        setBaseline(draftFingerprint(cached.draft));
        setDataStatus(cached.status === "pending" ? "pending" : "idle");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const fallback = localRepository.get(selectedDate);
        if (error instanceof SheetsApiError && error.code === "network") {
          setDataStatus(fallback?.status === "pending" ? "pending" : "idle");
          if (isDirtyRef.current) return;
          const nextDraft = fallback?.draft ?? createEmptyDraft(selectedDate);
          setDraft(nextDraft);
          setBaseline(draftFingerprint(nextDraft));
          setRowNumber(fallback?.rowNumber ?? null);
          setStatusMessage("Could not reach Google Sheets · using data on this device");
          return;
        }
        handleSheetsError(error);
      });

    return () => {
      active = false;
    };
  }, [
    canUseApp,
    draftRepository,
    gateway,
    handleSheetsError,
    isOnline,
    localRepository,
    refreshLocalRecords,
    reloadNonce,
    selectedDate,
  ]);

  useEffect(() => {
    if (!isDirty) {
      cancelScheduledAutosave();
      if (draftSavedAt !== null) forgetDraft(draft.date);
      return;
    }
    if (autosaveTimerRef.current !== null) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      persistDraft();
    }, AUTOSAVE_INTERVAL_MS);
  }, [cancelScheduledAutosave, draft, draftSavedAt, forgetDraft, isDirty, persistDraft]);

  useEffect(() => cancelScheduledAutosave, [cancelScheduledAutosave]);

  // Backgrounding a tab on mobile can discard it without warning, so write
  // immediately whenever the page stops being visible.
  useEffect(() => {
    const flush = () => {
      if (isDirtyRef.current) persistDraft();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [persistDraft]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== LOCAL_RECORDS_KEY) return;
      refreshLocalRecords();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshLocalRecords]);

  // Edits normally survive a close, so only warn when this device refuses to keep them.
  useEffect(() => {
    if (!isDirty || !storageBlocked) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      persistDraft();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, persistDraft, storageBlocked]);

  const changeDate = (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    // Keep this day's unsaved edits so they are waiting when the user comes back.
    if (isDirty) persistDraft();
    const empty = createEmptyDraft(nextDate);
    setSelectedDate(nextDate);
    setDraft(empty);
    setBaseline(draftFingerprint(empty));
    setRowNumber(null);
    setFieldErrors({});
    setStatusMessage(null);
    setEditingNotesDate(null);
    setDraftSavedAt(null);
    setRestoredAt(null);
  };

  const discardRestoredDraft = () => {
    if (!window.confirm("Discard the unsaved changes kept for this day?")) return;
    forgetDraft(selectedDate);
    hydratedDateRef.current = null;
    setReloadNonce((current) => current + 1);
  };

  const markDraftChanged = () => {
    setStatusMessage(null);
    setDataStatus((current) => (current === "saving" ? current : "idle"));
  };

  const updateMetric = (key: MetricKey, value: string) => {
    setDraft((current) => ({
      ...current,
      scores: { ...current.scores, [key]: value },
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    markDraftChanged();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dataStatus === "saving") return;
    const { record, errors } = validateDraft(draft);
    setFieldErrors(errors);

    if (!record) {
      setDataStatus("error");
      setStatusMessage("Correct the highlighted fields before saving.");
      document.querySelector<HTMLElement>("[aria-invalid='true'], .field-error")?.focus?.();
      return;
    }

    try {
      const savedDraft = recordAsDraft(record);
      localRepository.savePending(savedDraft, rowNumber);
      refreshLocalRecords();
      forgetDraft(savedDraft.date);
      setStorageBlocked(false);
      setDraft(savedDraft);
      setBaseline(draftFingerprint(savedDraft));
      setFieldErrors({});
      setDataStatus("pending");
      setStatusMessage("Saved on this device · waiting to sync");
      if (gateway && isOnline) void syncPendingRecords();
    } catch (error: unknown) {
      // The save failed, so these edits still only exist in the form.
      persistDraft();
      setDataStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "This device could not save your day locally.",
      );
    }
  };

  if (APP_CONFIG.errors.length > 0) {
    return (
      <main className="center-screen">
        <section className="auth-card" aria-labelledby="config-title">
          <span className="brand-mark" aria-hidden="true">LM</span>
          <p className="eyebrow">Setup needed</p>
          <h1 id="config-title">Life Metrics isn’t configured yet</h1>
          <p>Add the following values to a local <code>.env.local</code> file or GitHub variables:</p>
          <ul className="config-errors">
            {APP_CONFIG.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </section>
      </main>
    );
  }

  if (!canUseApp) {
    const isInitializing = auth.status === "initializing";
    const isExpired = auth.status === "expired";
    return (
      <main className="center-screen">
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="brand-mark" aria-hidden="true">LM</span>
          <p className="eyebrow">Daily check-in</p>
          <h1 id="auth-title">A clearer view of your day.</h1>
          <p className="auth-card__copy">
            {isExpired
              ? "Your Google session expired. Reconnect to keep your data private and up to date."
              : "Connect the Google account that has access to your Life Metrics sheet."}
          </p>
          {auth.error && <p className="notice notice--error" role="alert">{auth.error}</p>}
          <button
            className="button button--primary button--wide"
            type="button"
            onClick={auth.connect}
            disabled={isInitializing || !auth.isGoogleReady}
          >
            {isInitializing ? "Loading Google…" : isExpired ? "Reconnect Google" : "Continue with Google"}
          </button>
          <p className="auth-card__privacy">Only Google Sheets access is requested.</p>
        </section>
      </main>
    );
  }

  const controlsDisabled = dataStatus === "loading" || dataStatus === "saving";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark brand-mark--small" aria-hidden="true">LM</span>
          <div>
            <p className="eyebrow">Daily check-in</p>
            <h1>Life Metrics</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className={`sync-badge${!isOnline ? " sync-badge--offline" : ""}`} role="status" aria-live="polite">
            {!isOnline
              ? pendingCount > 0
                ? `Offline · ${pendingCount} pending`
                : "Offline"
              : pendingCount > 0
                ? `${pendingCount} pending`
                : "Synced"}
          </div>
          <button
            className="button button--quiet"
            type="button"
            onClick={auth.status === "authenticated" ? auth.signOut : auth.connect}
            disabled={auth.status !== "authenticated" && !auth.isGoogleReady}
          >
            {auth.status === "authenticated" ? "Sign out" : "Reconnect Google"}
          </button>
        </div>
      </header>

      <main className="content">
        <section className="date-panel" aria-labelledby="date-title">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2 id="date-title">{formatDisplayDate(selectedDate)}</h2>
          </div>
          <div className="date-controls">
            <label className="sr-only" htmlFor="record-date">Select date</label>
            <input
              id="record-date"
              type="date"
              value={selectedDate}
              disabled={controlsDisabled}
              onChange={(event) => changeDate(event.target.value)}
            />
            <button
              className="button button--secondary"
              type="button"
              disabled={controlsDisabled || selectedDate === today}
              onClick={() => changeDate(today)}
            >
              Today
            </button>
          </div>
        </section>

        {restoredAt !== null && (
          <div className="notice notice--restored" role="status">
            <span>
              Picked up where you left off — unsaved changes from {formatClockTime(restoredAt)} are back in
              the form.
            </span>
            <button className="button button--quiet" type="button" onClick={discardRestoredDraft}>
              Discard them
            </button>
          </div>
        )}

        {storageBlocked && (
          <p className="notice notice--error" role="alert">{STORAGE_BLOCKED_MESSAGE}</p>
        )}

        {dataStatus === "loading" ? (
          <section className="loading-panel" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading this day from Google Sheets…</p>
          </section>
        ) : (
          <form onSubmit={save} noValidate>
            <section className="form-section" aria-labelledby="scores-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">01 · Scores</p>
                  <h2 id="scores-title">How did the day feel?</h2>
                </div>
                <p>Move a slider for whole numbers, or type a decimal.</p>
              </div>
              <div className="metrics-grid">
                {METRIC_KEYS.map((key) => (
                  <MetricField
                    key={key}
                    id={key}
                    label={METRIC_LABELS[key]}
                    value={draft.scores[key]}
                    error={fieldErrors[key]}
                    onChange={(value) => updateMetric(key, value)}
                  />
                ))}
              </div>
            </section>

            <section className="form-section reflection-section" aria-labelledby="reflection-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">02 · Reflection</p>
                  <h2 id="reflection-title">Round out the picture.</h2>
                </div>
              </div>
              <div className="reflection-grid">
                <SegmentedControl<JValue>
                  legend="J"
                  name="j-value"
                  values={["Y", "N"]}
                  value={draft.j}
                  error={fieldErrors.j}
                  onChange={(j) => {
                    setDraft((current) => ({ ...current, j }));
                    setFieldErrors((current) => ({ ...current, j: undefined }));
                    markDraftChanged();
                  }}
                />
                <SegmentedControl<QualityOfDay>
                  legend="Quality of day"
                  name="quality"
                  values={QUALITY_VALUES}
                  value={draft.quality}
                  error={fieldErrors.quality}
                  className="quality-field"
                  onChange={(quality) => {
                    setDraft((current) => ({ ...current, quality }));
                    setFieldErrors((current) => ({ ...current, quality: undefined }));
                    markDraftChanged();
                  }}
                />
              </div>

              <NotesField
                value={draft.notes}
                error={fieldErrors.notes}
                isReading={
                  selectedDate < today &&
                  draft.notes.trim().length > 0 &&
                  editingNotesDate !== selectedDate
                }
                onEdit={() => setEditingNotesDate(selectedDate)}
                onChange={(notes) => {
                  setDraft((current) => ({ ...current, notes }));
                  setFieldErrors((current) => ({ ...current, notes: undefined }));
                  markDraftChanged();
                }}
              />
            </section>

            <div className="save-bar">
              <div className="save-status" aria-live="polite">
                <span
                  className={`status-dot status-dot--${dataStatus}`}
                  aria-hidden="true"
                />
                <span>
                  {statusMessage ||
                    (isDirty
                      ? draftSavedAt !== null
                        ? `Unsaved changes · kept on this device at ${formatClockTime(draftSavedAt)}`
                        : "Unsaved changes"
                      : selectedLocalRecord?.status === "pending"
                        ? "Saved on this device · waiting to sync"
                        : rowNumber || selectedLocalRecord?.status === "synced"
                          ? "Synced"
                          : "New day")}
                </span>
              </div>
              <button
                className="button button--primary save-button"
                type="submit"
                disabled={dataStatus === "saving"}
              >
                {dataStatus === "saving" ? "Saving…" : rowNumber || selectedLocalRecord ? "Save changes" : "Create day"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
};

export default App;
