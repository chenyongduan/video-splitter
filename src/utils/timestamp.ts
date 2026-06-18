/**
 * Try to parse a text selection as a Unix timestamp (seconds or milliseconds).
 * Returns a Date on success, null otherwise.
 */
export function tryParseTimestamp(text: string): Date | null {
  const cleaned = text.replace(/["',]/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num) || cleaned.length === 0) return null;
  if (cleaned.length === 13 && num >= 1e12 && num < 1e14) return new Date(num);
  if (cleaned.length >= 9 && cleaned.length <= 10 && num >= 1e9 && num < 1e10)
    return new Date(num * 1000);
  return null;
}

/**
 * Format a Date as `YYYY-MM-DD HH:mm:ss`.
 */
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
