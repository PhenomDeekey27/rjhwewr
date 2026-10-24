/**
 * Runtime configuration for the dashboard.
 *
 * NOTE: the day-ahead cutoff below is an [Assumption] per wind_forecast.md §3.5
 * (proposed D‑1 09:00 Europe/London). It is NOT a verified business rule and
 * must be confirmed before it is treated as fact. It is centralized here so it
 * can be changed in one place and displayed wherever it applies.
 */

export const APP_NAME = "Wind Forecast Accuracy";

/**
 * Day-ahead decision cutoff: 09:00 Europe/London on the day before delivery (D‑1).
 * Represented as the hour (0-23) in the London timezone.
 */
export const DAY_AHEAD_CUTOFF_HOUR_LONDON = 9;

/**
 * Human-readable rendering of the current cutoff rule. Shown in the top bar,
 * the KPI context, and the Methodology page alongside an AssumptionBadge.
 */
export function cutoffRuleLabel(): string {
  return `D‑1 ${String(DAY_AHEAD_CUTOFF_HOUR_LONDON).padStart(2, "0")}:00 London`;
}

export const ANALYSIS_MONTH = "January 2026";

/**
 * Single unit constant for generation values. Elexon documentation states MW;
 * confirmation against the live OpenAPI specification remains open, so the
 * Methodology page labels it as pending verification.
 */
export const UNITS = {
  generation: "MW",
} as const;

export const ANALYSIS_START_UTC = "2026-01-01T00:00:00Z";
export const ANALYSIS_END_UTC = "2026-02-01T00:00:00Z"; // exclusive

/**
 * Scoped note about the publication window: forecasts published in late
 * December 2025 for early-January delivery are eligible, so the fetch window
 * for publishTime must extend before 1 January.
 */
export const PUBLICATION_WINDOW_NOTE =
  "Forecasts published in late December 2025 for early‑January delivery are eligible.";
