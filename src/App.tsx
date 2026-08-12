import { useCallback, useEffect, useMemo, useState } from "react";
import { MetricField } from "./components/MetricField";
import { SegmentedControl } from "./components/SegmentedControl";
import { APP_CONFIG } from "./config";
import { formatDisplayDate, getTodayInLondon } from "./lib/date";
import { createEmptyDraft, draftFingerprint, validateDraft } from "./lib/records";
import { useGoogleAuth } from "./services/auth";
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

type DataStatus = "idle" | "loading" | "saving" | "saved" | "error";

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
  const today = getTodayInLondon();
  const [selectedDate, setSelectedDate] = useState(today);
  const [draft, setDraft] = useState<LifeMetricDraft>(() => createEmptyDraft(today));
  const [baseline, setBaseline] = useState(() => draftFingerprint(createEmptyDraft(today)));
  const [rowNumber, setRowNumber] = useState<number | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("idle");
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const gateway = useMemo(() => {
    if (!auth.accessToken || APP_CONFIG.errors.length > 0) return null;
    return createSheetsGateway({
      accessToken: auth.accessToken,
      spreadsheetId: APP_CONFIG.spreadsheetId,
      sheetName: APP_CONFIG.sheetName,
    });
  }, [auth.accessToken]);

  const isDirty = draftFingerprint(draft) !== baseline;

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
    if (auth.status !== "authenticated" || !gateway) return;
    let active = true;
    setDataStatus("loading");
    setStatusMessage(null);
    setFieldErrors({});

    gateway
      .loadRecord(selectedDate)
      .then((loaded) => {
        if (!active) return;
        setDraft(loaded.draft);
        setBaseline(draftFingerprint(loaded.draft));
        setRowNumber(loaded.rowNumber);
        setDataStatus("idle");
      })
      .catch((error: unknown) => {
        if (active) handleSheetsError(error);
      });

    return () => {
      active = false;
    };
  }, [auth.status, gateway, handleSheetsError, selectedDate]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const changeDate = (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    if (isDirty && !window.confirm("Discard your unsaved changes and load another date?")) return;
    const empty = createEmptyDraft(nextDate);
    setSelectedDate(nextDate);
    setDraft(empty);
    setBaseline(draftFingerprint(empty));
    setRowNumber(null);
    setFieldErrors({});
    setStatusMessage(null);
  };

  const updateMetric = (key: MetricKey, value: string) => {
    setDraft((current) => ({
      ...current,
      scores: { ...current.scores, [key]: value },
    }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    if (dataStatus === "saved") setDataStatus("idle");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!gateway || dataStatus === "saving") return;
    const { record, errors } = validateDraft(draft);
    setFieldErrors(errors);

    if (!record) {
      setDataStatus("error");
      setStatusMessage("Complete the highlighted fields before saving.");
      document.querySelector<HTMLElement>("[aria-invalid='true'], .field-error")?.focus?.();
      return;
    }

    setDataStatus("saving");
    setStatusMessage(null);
    try {
      const result = rowNumber
        ? await gateway.updateRecord(rowNumber, record)
        : await gateway.appendRecord(record);
      const savedDraft = recordAsDraft(record);
      setDraft(savedDraft);
      setBaseline(draftFingerprint(savedDraft));
      setRowNumber(result.rowNumber);
      setFieldErrors({});
      setDataStatus("saved");
      setStatusMessage(result.created ? "Day created and saved." : "Changes saved.");
    } catch (error: unknown) {
      handleSheetsError(error);
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

  if (auth.status !== "authenticated") {
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
        <button className="button button--quiet" type="button" onClick={auth.signOut}>
          Sign out
        </button>
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
                  }}
                />
              </div>

              <div className="notes-field">
                <div className="notes-field__heading">
                  <label htmlFor="notes">Notes</label>
                  <span>{draft.notes.length.toLocaleString()} characters</span>
                </div>
                <textarea
                  id="notes"
                  rows={8}
                  value={draft.notes}
                  aria-invalid={Boolean(fieldErrors.notes)}
                  aria-describedby={fieldErrors.notes ? "notes-error" : "notes-help"}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, notes: event.target.value }));
                    setFieldErrors((current) => ({ ...current, notes: undefined }));
                  }}
                  placeholder="What happened today? Capture the moments, patterns, and details you want to remember…"
                />
                {fieldErrors.notes ? (
                  <p className="field-error" id="notes-error" role="alert">{fieldErrors.notes}</p>
                ) : (
                  <p className="field-help" id="notes-help">Required · Saved directly to column T.</p>
                )}
              </div>
            </section>

            <div className="save-bar">
              <div className="save-status" aria-live="polite">
                <span
                  className={`status-dot status-dot--${dataStatus}`}
                  aria-hidden="true"
                />
                <span>
                  {statusMessage || (isDirty ? "Unsaved changes" : rowNumber ? "Existing day loaded" : "New day")}
                </span>
              </div>
              <button
                className="button button--primary save-button"
                type="submit"
                disabled={dataStatus === "saving"}
              >
                {dataStatus === "saving" ? "Saving…" : rowNumber ? "Save changes" : "Create day"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
};

export default App;
