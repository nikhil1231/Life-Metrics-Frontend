import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  NOTE_TITLE_MAX_LENGTH,
  hasReservedNoteDelimiter,
  parseNotes,
  serializeNotes,
  type NoteMoment,
} from "../lib/notes";

type NotesFieldProps = {
  value: string;
  error?: string;
  isReading: boolean;
  onChange: (value: string) => void;
  onEdit: () => void;
};

type MomentCardProps = {
  moment: NoteMoment;
  index: number;
  canRemove: boolean;
  shouldFocus: boolean;
  onUpdate: (moment: NoteMoment) => void;
  onRemove: () => void;
};

const useAutoSize = (
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) => {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.max(element.scrollHeight, 112)}px`;
  }, [ref, value]);
};

const MomentCard = ({
  moment,
  index,
  canRemove,
  shouldFocus,
  onUpdate,
  onRemove,
}: MomentCardProps) => {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [focusBodyAfterTitle, setFocusBodyAfterTitle] = useState(false);
  const [reservedDelimiterError, setReservedDelimiterError] = useState(false);
  useAutoSize(bodyRef, moment.body);

  useEffect(() => {
    if (!shouldFocus && !focusBodyAfterTitle) return;
    bodyRef.current?.focus();
    if (focusBodyAfterTitle) setFocusBodyAfterTitle(false);
  }, [focusBodyAfterTitle, shouldFocus, moment.title]);

  const updateBodyOnly = (nextValue: string) => {
    if (hasReservedNoteDelimiter(nextValue)) {
      setReservedDelimiterError(true);
      return;
    }
    setReservedDelimiterError(false);

    const lineBreak = nextValue.indexOf("\n");
    const possibleTitle = lineBreak >= 0 ? nextValue.slice(0, lineBreak).trim() : "";

    if (
      lineBreak >= 0 &&
      possibleTitle.length > 0 &&
      possibleTitle.length <= NOTE_TITLE_MAX_LENGTH
    ) {
      setFocusBodyAfterTitle(true);
      onUpdate({ title: possibleTitle, body: nextValue.slice(lineBreak + 1) });
      return;
    }

    onUpdate({ title: "", body: nextValue });
  };

  return (
    <article className={`moment-card${moment.title ? " moment-card--titled" : ""}`}>
      <div className="moment-card__topline">
        <span>Moment {index + 1}</span>
        {canRemove && (
          <button
            className="moment-card__remove"
            type="button"
            aria-label={`Remove moment ${index + 1}`}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>

      {moment.title && (
        <>
          <label className="sr-only" htmlFor={`moment-title-${index}`}>Moment title</label>
          <input
            className="moment-card__title"
            id={`moment-title-${index}`}
            value={moment.title}
            maxLength={NOTE_TITLE_MAX_LENGTH}
            onChange={(event) => {
              if (hasReservedNoteDelimiter(event.target.value)) {
                setReservedDelimiterError(true);
                return;
              }
              setReservedDelimiterError(false);
              onUpdate({ ...moment, title: event.target.value });
            }}
          />
        </>
      )}

      <label className="sr-only" htmlFor={`moment-body-${index}`}>Moment {index + 1}</label>
      <textarea
        ref={bodyRef}
        className="moment-card__body"
        id={`moment-body-${index}`}
        rows={4}
        value={moment.body}
        onChange={(event) => {
          if (!moment.title) {
            updateBodyOnly(event.target.value);
            return;
          }
          if (hasReservedNoteDelimiter(event.target.value)) {
            setReservedDelimiterError(true);
            return;
          }
          setReservedDelimiterError(false);
          onUpdate({ ...moment, body: event.target.value });
        }}
      />
      {reservedDelimiterError && (
        <p className="moment-card__error" role="alert">Em dashes and // are reserved.</p>
      )}
    </article>
  );
};

export const NotesField = ({ value, error, isReading, onChange, onEdit }: NotesFieldProps) => {
  const [moments, setMoments] = useState<NoteMoment[]>(() => {
    const parsed = parseNotes(value);
    return parsed.length > 0 ? parsed : [{ title: "", body: "" }];
  });
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const lastEmittedValue = useRef(value);

  useEffect(() => {
    if (value === lastEmittedValue.current) return;
    const parsed = parseNotes(value);
    setMoments(parsed.length > 0 ? parsed : [{ title: "", body: "" }]);
    lastEmittedValue.current = value;
    setFocusIndex(null);
  }, [value]);

  const commit = (nextMoments: NoteMoment[]) => {
    setMoments(nextMoments);
    const serialized = serializeNotes(nextMoments);
    lastEmittedValue.current = serialized;
    onChange(serialized);
  };

  const addMoment = () => {
    const next = [...moments, { title: "", body: "" }];
    setFocusIndex(next.length - 1);
    commit(next);
  };

  const readingMoments = parseNotes(value);

  return (
    <div className="notes-field">
      <div className="notes-field__heading">
        <span className="notes-field__label" id="notes-label">Notes</span>
        <div className="notes-field__actions">
          <span>{value.length.toLocaleString()} characters</span>
          {isReading && (
            <button className="notes-edit-button" type="button" onClick={onEdit}>Edit</button>
          )}
        </div>
      </div>

      {isReading ? (
        <div className="moments-reading" aria-labelledby="notes-label">
          {readingMoments.map((moment, index) => (
            <article className="reading-moment" key={`${moment.title}-${index}`}>
              {moment.title && <h3>{moment.title}</h3>}
              <p>{moment.body}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="moments-editor" aria-labelledby="notes-label">
          {moments.map((moment, index) => (
            <MomentCard
              key={index}
              moment={moment}
              index={index}
              canRemove={moments.length > 1}
              shouldFocus={focusIndex === index}
              onUpdate={(nextMoment) => {
                setFocusIndex(null);
                commit(moments.map((item, itemIndex) => itemIndex === index ? nextMoment : item));
              }}
              onRemove={() => {
                setFocusIndex(null);
                commit(moments.filter((_, itemIndex) => itemIndex !== index));
              }}
            />
          ))}
          <button className="add-moment-button" type="button" onClick={addMoment}>
            <span aria-hidden="true">+</span> Add moment
          </button>
        </div>
      )}

      {error ? (
        <p className="field-error" id="notes-error" role="alert">{error}</p>
      ) : (
        <p className="field-help" id="notes-help">Optional · Saved directly to column T.</p>
      )}
    </div>
  );
};
