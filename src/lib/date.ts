const DAY_MS = 86_400_000;
const GOOGLE_EPOCH_UTC = Date.UTC(1899, 11, 30);

const parseIsoDate = (date: string): [number, number, number] | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
};

export const isValidIsoDate = (date: string): boolean => parseIsoDate(date) !== null;

export const isoDateToGoogleSerial = (date: string): number => {
  const parts = parseIsoDate(date);
  if (!parts) throw new Error(`Invalid ISO date: ${date}`);
  const [year, month, day] = parts;
  return (Date.UTC(year, month - 1, day) - GOOGLE_EPOCH_UTC) / DAY_MS;
};

export const googleSerialToIsoDate = (serial: number): string => {
  if (!Number.isFinite(serial)) throw new Error("Invalid Google date serial.");
  const date = new Date(GOOGLE_EPOCH_UTC + Math.round(serial) * DAY_MS);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const DAY_ROLLOVER_HOUR = 6;

/** "Today" in the local time zone, where the day only rolls over at 06:00 rather than midnight. */
export const getToday = (now: Date = new Date()): string => {
  const day = now.getDate() - (now.getHours() < DAY_ROLLOVER_HOUR ? 1 : 0);
  const start = new Date(now.getFullYear(), now.getMonth(), day);
  return [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
};

export const formatClockTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));

export const formatDisplayDate = (date: string): string => {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};
