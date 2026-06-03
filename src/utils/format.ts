/**
 * Format seconds to HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/**
 * Parse HH:MM:SS to seconds
 */
export function parseTime(str: string): number {
  const parts = str.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

/**
 * Generate default filename for a segment
 */
export function generateFilename(start: number, end: number): string {
  return `${Math.round(start)}-${Math.round(end)}.mp4`;
}
