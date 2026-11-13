/** Localized short date (e.g. "Dec 8, 2026" / "8. Dez. 2026"); the raw string when unparseable. */
export function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

/** Localized relative day ("in 25 days" / "tomorrow" / "in 25 Tagen" / "morgen"). */
export function formatRelativeDays(days: number, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
}
