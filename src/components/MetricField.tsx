type MetricFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

const sliderValue = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10, Math.max(1, Math.round(parsed)));
};

export const MetricField = ({ id, label, value, error, onChange }: MetricFieldProps) => (
  <div className={`metric-card${error ? " metric-card--error" : ""}`}>
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
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder="—"
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
    {error && (
      <p className="field-error" id={`${id}-error`} role="alert">
        {error}
      </p>
    )}
  </div>
);
