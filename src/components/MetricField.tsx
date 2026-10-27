type MetricFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  /** The coach's suggested score, shown only while the field is empty. */
  suggestion?: number;
  /** Why it was suggested, or (without a score) what the day showed. */
  reason?: string;
  onUseSuggestion?: () => void;
  onChange: (value: string) => void;
};

const sliderValue = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, Math.round(parsed)));
};

export const MetricField = ({
  id,
  label,
  value,
  error,
  suggestion,
  reason,
  onUseSuggestion,
  onChange,
}: MetricFieldProps) => {
  const isEmpty = value.trim() === "";
  const showSuggestion = isEmpty && suggestion !== undefined;
  const showHint = showSuggestion || (isEmpty && Boolean(reason));
  return (
    <div className={`metric-card${error ? " metric-card--error" : ""}${showSuggestion ? " metric-card--suggested" : ""}`}>
      <div className="metric-card__heading">
        <label htmlFor={`${id}-number`}>{label}</label>
        <div className="metric-card__number-wrap">
          <input
            id={`${id}-number`}
            className="metric-card__number"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            aria-invalid={Boolean(error)}
            aria-describedby={[error ? `${id}-error` : "", showHint ? `${id}-suggestion` : ""].join(" ").trim() || undefined}
            onChange={(event) => onChange(event.target.value)}
            placeholder={showSuggestion ? String(suggestion) : "—"}
          />
          <span aria-hidden="true">/10</span>
        </div>
      </div>
      <div className="metric-card__slider-row">
        <span aria-hidden="true">1</span>
        <input
          className="metric-card__slider"
          type="range"
          min="1"
          max="10"
          step="1"
          value={sliderValue(value)}
          aria-label={`${label} integer slider`}
          onChange={(event) => onChange(event.target.value)}
        />
        <span aria-hidden="true">10</span>
      </div>
      {showHint && (
        <div className="metric-card__suggestion" id={`${id}-suggestion`}>
          <span>
            {showSuggestion ? `Suggested ${suggestion}${reason ? " · " : ""}` : ""}
            {reason}
          </span>
          {showSuggestion && onUseSuggestion && (
            <button
              className="metric-card__use"
              type="button"
              onClick={onUseSuggestion}
              aria-label={`Use the suggested ${label} score, ${suggestion}`}
            >
              Use
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
