/**
 * Shared formatting utilities (§5, §10.3, §14).
 * All numeric output is plain text; callers apply tabular-nums styling.
 * Signed values use the true minus sign (U+2212).
 */

const NUMBER_0 = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

const NUMBER_1 = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: true,
});

const LONDON_DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
  timeZoneName: "short",
});

const LONDON_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
});

/** Unavailable value. Never zero as a stand-in. */
export const PLACEHOLDER = "—";

export function formatMw(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return PLACEHOLDER;
  }
  return NUMBER_0.format(Math.round(value));
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return PLACEHOLDER;
  }
  return NUMBER_0.format(Math.round(value));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return PLACEHOLDER;
  }
  return `${NUMBER_1.format(value)}%`;
}

/**
 * Signed error with an explicit + / − sign.
 * Positive = over-forecast; negative = under-forecast.
 */
export function formatSignedMw(value: number | null | undefined): {
  sign: "+" | "−" | "";
  abs: string;
} {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { sign: "", abs: PLACEHOLDER };
  }
  const sign: "+" | "−" | "" = value > 0 ? "+" : value < 0 ? "−" : "";
  return { sign, abs: NUMBER_0.format(Math.round(Math.abs(value))) };
}

/** "1 Jan 2026 00:00 GMT" with an explicit timezone label. */
export function formatLondonTime(iso: string | null | undefined): string {
  if (!iso) return PLACEHOLDER;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;
  return LONDON_DATE_TIME.format(date);
}

/** "1 Jan 2026" — delivery day only. */
export function formatDeliveryDay(iso: string | null | undefined): string {
  if (!iso) return PLACEHOLDER;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER;
  return LONDON_DAY.format(date);
}
