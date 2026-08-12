type SegmentedControlProps<T extends string> = {
  legend: string;
  name: string;
  values: readonly T[];
  value: T | "";
  error?: string;
  className?: string;
  onChange: (value: T) => void;
};

export const SegmentedControl = <T extends string>({
  legend,
  name,
  values,
  value,
  error,
  className = "",
  onChange,
}: SegmentedControlProps<T>) => (
  <fieldset className={`choice-field ${className}`.trim()}>
    <legend>{legend}</legend>
    <div className="segmented-control">
      {values.map((option) => (
        <label
          className={`segmented-control__option${value === option ? " is-selected" : ""}`}
          key={option}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
    {error && (
      <p className="field-error" role="alert">
        {error}
      </p>
    )}
  </fieldset>
);
