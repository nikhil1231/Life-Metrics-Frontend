export const NOTE_TITLE_MAX_LENGTH = 80;
export const NOTE_TITLE_SEPARATOR = " — ";
export const NOTE_MOMENT_SEPARATOR = " // ";

export type NoteMoment = {
  title: string;
  body: string;
};

export const parseNotes = (notes: string): NoteMoment[] => {
  const normalized = notes.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.includes(NOTE_MOMENT_SEPARATOR)
    ? normalized.split(NOTE_MOMENT_SEPARATOR)
    : normalized.split(/\n\s*\n+/);

  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const titleSeparatorIndex = block.indexOf(NOTE_TITLE_SEPARATOR);
      if (titleSeparatorIndex > 0) {
        return {
          title: block.slice(0, titleSeparatorIndex).trim(),
          body: block.slice(titleSeparatorIndex + NOTE_TITLE_SEPARATOR.length).trim(),
        };
      }

      const [firstLine = "", ...remainingLines] = block.split("\n");
      const possibleTitle = firstLine.trim();
      const body = remainingLines.join("\n").trim();

      if (body && possibleTitle.length > 0 && possibleTitle.length <= NOTE_TITLE_MAX_LENGTH) {
        return { title: possibleTitle, body };
      }

      return { title: "", body: block };
    });
};

export const serializeNotes = (moments: NoteMoment[]): string =>
  moments
    .map(({ title, body }) => {
      const cleanTitle = title.trim().replace(/\s*\n+\s*/g, " ");
      const cleanBody = body.trim().replace(/\s*\n+\s*/g, " ");
      if (cleanTitle && cleanBody) return `${cleanTitle}${NOTE_TITLE_SEPARATOR}${cleanBody}`;
      return cleanBody || cleanTitle;
    })
    .filter(Boolean)
    .join(NOTE_MOMENT_SEPARATOR);

export const hasReservedNoteDelimiter = (value: string): boolean =>
  value.includes("—") || value.includes("//");
