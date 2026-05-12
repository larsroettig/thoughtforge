/**
 * Parse flexible time input into hours (decimal).
 *
 * Supports:
 *   "45m" or "45min"       -> 0.75
 *   "1h" or "1hr"          -> 1.0
 *   "1h30m" or "1h 30m"    -> 1.5
 *   "1.5h" or "1.5"        -> 1.5
 *   "90m"                  -> 1.5
 *   "2"                    -> 2.0 (plain number = hours)
 *   "0:45" or "1:30"       -> 0.75 or 1.5
 */
export function parseTimeInput(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  // Format: "H:MM"
  const colonMatch = s.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return h + m / 60;
  }

  // Format: "Xh Ym" or "XhYm"
  const hmMatch = s.match(/^(\d+(?:\.\d+)?)\s*h(?:r|ours?)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (hmMatch) {
    const h = parseFloat(hmMatch[1]);
    const m = hmMatch[2] ? parseInt(hmMatch[2], 10) : 0;
    return h + m / 60;
  }

  // Format: "Xm" or "Xmin"
  const mMatch = s.match(/^(\d+)\s*m(?:in)?$/);
  if (mMatch) {
    return parseInt(mMatch[1], 10) / 60;
  }

  // Plain number (hours)
  const num = parseFloat(s);
  if (!isNaN(num) && num >= 0) return num;

  return null;
}

/**
 * Format hours as a human-readable string.
 * 0.75 -> "45m"
 * 1.0  -> "1h"
 * 1.5  -> "1h 30m"
 * 2.25 -> "2h 15m"
 */
export function formatHours(hours: number): string {
  if (hours <= 0) return "0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
