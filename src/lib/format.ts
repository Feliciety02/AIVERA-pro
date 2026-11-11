import { format, formatDistanceToNowStrict, isValid, parseISO, differenceInCalendarDays } from "date-fns";

/**
 * Display preferences (Settings → General). Kept as module state so pure
 * formatting helpers don't need to import the store; App syncs it on change.
 */
let prefs: { dateFormat: string; timezone: string } = { dateFormat: "MMM d, yyyy", timezone: "local" };

export function setDisplayPreferences(p: { dateFormat: string; timezone: string }) {
  prefs = { dateFormat: p.dateFormat, timezone: p.timezone };
}

function toDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

/** Date-only values are stored as midnight UTC; they must not shift across timezones. */
function isDateOnly(value: string | Date): boolean {
  return typeof value === "string" && /T00:00:00(\.000)?Z$/.test(value);
}

/** Returns a Date whose local wall-clock fields equal the instant's time in the configured zone. */
function inZone(d: Date): Date {
  if (prefs.timezone === "local") return d;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: prefs.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    return d;
  }
}

function zoned(value: string | Date): Date | null {
  const d = toDate(value);
  if (!d) return null;
  if (isDateOnly(value)) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return inZone(d);
}

export function formatDate(value: string | Date | undefined | null, pattern?: string): string {
  if (!value) return "—";
  const d = zoned(value);
  return d ? format(d, pattern ?? prefs.dateFormat) : "—";
}

export function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return "—";
  const d = zoned(value);
  if (!d) return "—";
  const tz = prefs.timezone === "local" ? "" : ` ${prefs.timezone === "UTC" ? "UTC" : prefs.timezone.split("/").pop()!.replace("_", " ")}`;
  return `${format(d, prefs.dateFormat)} · ${format(d, "HH:mm")}${tz}`;
}

export function formatRelative(value: string | Date | undefined | null): string {
  const d = toDate(value);
  return d ? `${formatDistanceToNowStrict(d)} ago` : "—";
}

export function daysUntil(value: string | undefined | null): number | null {
  const d = toDate(value);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function toInputDate(value: string | undefined | null): string {
  const d = toDate(value);
  if (!d) return "";
  return isDateOnly(value!) ? value!.slice(0, 10) : format(d, "yyyy-MM-dd");
}
