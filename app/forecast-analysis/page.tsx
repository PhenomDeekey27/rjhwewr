"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/FilterBar";
import {
  Button,
  DateInput,
  Field,
} from "@/components/ui/controls";
import {
  KpiCell,
  KpiStat,
  KpiStrip,
} from "@/components/ui/KpiStat";
import { Panel } from "@/components/ui/Panel";
import { StateBlock } from "@/components/ui/StateBlock";
import { AssumptionBadge } from "@/components/ui/AssumptionBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { ChartPanel } from "@/components/charts/ChartPanel";
import {
  ErrorChart,
  TimeSeriesChart,
  type ChartSeries,
} from "@/components/charts/TimeSeriesChart";
import {
  DataQualityPanel,
  emptyQualityItems,
} from "@/components/dashboard/DataQualityPanel";
import {
  clearCache,
  fetchForecastAccuracy,
  type AccuracyEnvelope,
  type IntervalAccuracy,
} from "@/lib/api";
import {
  PLACEHOLDER,
  formatCount,
  formatDeliveryDay,
  formatPercent,
  formatSignedMw,
  formatZonedTime,
} from "@/lib/format";
import { cutoffRuleLabel } from "@/lib/config";
import {
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconRetry,
} from "@/components/ui/icons";

const MIN_DAY = "2026-01-01";
const MAX_DAY = "2026-01-31";
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

const MISSING_LABELS: Record<string, string> = {
  noEligibleForecast: "No eligible forecast",
  missingActual: "Missing actual",
  nullActualValue: "Null actual value",
  nullForecastValue: "Null forecast value",
  alignmentUnavailable: "Alignment unavailable",
};

function shiftDay(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function missingReasonLabel(reason: string) {
  return MISSING_LABELS[reason] ?? reason;
}

function missingRangesForDay(intervals: IntervalAccuracy[]) {
  const ranges: Array<[number, number]> = [];
  let start: number | null = null;
  let end: number | null = null;
  for (const interval of [...intervals].sort((a, b) =>
    a.deliveryTime.localeCompare(b.deliveryTime),
  )) {
    const time = Date.parse(interval.deliveryTime);
    if (interval.status === "matched") {
      if (start !== null && end !== null) {
        ranges.push([start, end]);
        start = null;
        end = null;
      }
    } else {
      if (start === null) start = time;
      end = time + INTERVAL_MS;
    }
  }
  if (start !== null && end !== null) ranges.push([start, end]);
  return ranges;
}

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

export default function ForecastAnalysisPage() {
  const [day, setDay] = useState(MIN_DAY);
  const [data, setData] = useState<AccuracyEnvelope | null>(null);
  const [loadedNonce, setLoadedNonce] = useState<number | null>(null);
  const [errorNonce, setErrorNonce] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshPendingRef = useRef(false);

  // Derived rather than stored: the effect only writes state when a response
  // arrives, so mounting or refreshing does not trigger a cascade of renders.
  const loadState: "loading" | "success" | "error" =
    errorNonce === refreshNonce
      ? "error"
      : loadedNonce === refreshNonce
        ? "success"
        : "loading";
  const busy = isRefreshing || loadState === "loading";

  useEffect(() => {
    const refresh = refreshPendingRef.current;
    refreshPendingRef.current = false;
    const controller = new AbortController();
    let cancelled = false;
    const nonce = refreshNonce;

    (async () => {
      try {
        const response = await fetchForecastAccuracy({
          refresh,
          signal: controller.signal,
        });
        if (cancelled) return;
        setData(response);
        setLoadedNonce(nonce);
        setErrorNonce(null);
        setErrorMessage(null);
        setLastSuccessAt(
          response.meta.retrievedAt ?? new Date().toISOString(),
        );
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setErrorNonce(nonce);
        setErrorMessage(
          error instanceof Error ? error.message : "Backend unavailable",
        );
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshNonce]);

  const handleRefresh = () => {
    clearCache("/api/elexon/forecast-accuracy");
    refreshPendingRef.current = true;
    setIsRefreshing(true);
    setErrorNonce(null);
    setErrorMessage(null);
    setRefreshNonce((value) => value + 1);
  };

  const payload = data?.data;
  const summary = payload?.summary;
  const daily = payload?.daily ?? [];
  const intervals = useMemo(() => payload?.intervals ?? [], [payload]);
  const meta = data?.meta;
  const checksPassed =
    data !== null &&
    data.quality.checks.length > 0 &&
    data.quality.checks.every((check) => check.passed);
  const complete =
    summary !== undefined &&
    summary.expectedIntervals > 0 &&
    summary.matchedIntervals === summary.expectedIntervals;

  const dataStatus =
    busy
      ? {
          label: isRefreshing ? "Refreshing" : "Loading",
          variant: "neutral" as const,
        }
      : loadState === "error"
        ? { label: "Error", variant: "error" as const }
        : complete && checksPassed
          ? {
              label: lastSuccessAt
                ? `Loaded · ${formatZonedTime(lastSuccessAt, "Europe/London")}`
                : "Loaded",
              variant: "favorable" as const,
            }
          : {
              label:
                (summary?.matchedIntervals ?? 0) === 0
                  ? "No matched intervals"
                  : "Partial data",
              variant: "warning" as const,
            };

  const dayLabel = formatDeliveryDay(`${day}T00:00:00Z`);
  const dayIntervals = useMemo(
    () => intervals.filter((interval) => interval.deliveryDate === day),
    [intervals, day],
  );
  const matchedDayIntervals = useMemo(
    () =>
      dayIntervals.filter(
        (interval) =>
          interval.status === "matched" &&
          interval.forecastGeneration !== null &&
          interval.actualGeneration !== null,
      ),
    [dayIntervals],
  );

  const domain = useMemo<[number, number]>(
    () => [Date.parse(`${day}T00:00:00Z`), Date.parse(`${day}T00:00:00Z`) + DAY_MS],
    [day],
  );

  const forecastSeries = useMemo<ChartSeries[]>(() => {
    const points = dayIntervals
      .filter((interval) => interval.forecastGeneration !== null)
      .map((interval) => ({
        t: Date.parse(interval.deliveryTime),
        v: interval.forecastGeneration,
      }));
    return points.length > 0
      ? [
          {
            name: "Day-ahead forecast (selected)",
            color: "var(--color-chart-forecast)",
            data: points,
          },
        ]
      : [];
  }, [dayIntervals]);

  const actualSeries = useMemo<ChartSeries[]>(() => {
    const points = matchedDayIntervals.map((interval) => ({
      t: Date.parse(interval.deliveryTime),
      v: interval.actualGeneration,
    }));
    return points.length > 0
      ? [
          {
            name: "Actual (FUELHH hourly mean)",
            color: "var(--color-chart-actual)",
            data: points,
          },
        ]
      : [];
  }, [matchedDayIntervals]);

  const chartSeries = useMemo(
    () => [...actualSeries, ...forecastSeries],
    [actualSeries, forecastSeries],
  );

  const errorBars = useMemo(
    () =>
      matchedDayIntervals
        .filter((interval) => interval.error !== null)
        .map((interval) => ({
          t: Date.parse(interval.deliveryTime),
          v: interval.error,
        })),
    [matchedDayIntervals],
  );

  const missingRanges = useMemo(
    () => missingRangesForDay(dayIntervals),
    [dayIntervals],
  );

  const largestErrors = useMemo(
    () =>
      [...matchedDayIntervals]
        .filter((interval) => interval.error !== null)
        .sort((a, b) => Math.abs(b.error ?? 0) - Math.abs(a.error ?? 0))
        .slice(0, 5),
    [matchedDayIntervals],
  );

  const dayMissing = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const interval of dayIntervals) {
      if (interval.status === "matched") continue;
      counts[interval.status] = (counts[interval.status] ?? 0) + 1;
    }
    return counts;
  }, [dayIntervals]);

  const dayMatched = matchedDayIntervals.length;
  const dayExpected = dayIntervals.length;
  const biasDirection =
    summary?.bias === null || summary?.bias === undefined
      ? "—"
      : summary.bias > 0
        ? "over-forecast"
        : summary.bias < 0
          ? "under-forecast"
          : "no bias";

  const qualityItems =
    data !== null
      ? [
          {
            label: "Matched intervals",
            value: `${formatCount(summary?.matchedIntervals ?? 0)} of ${formatCount(summary?.expectedIntervals ?? 0)}`,
            note: `${formatPercent(summary?.coveragePercent ?? null)} coverage`,
          },
          {
            label: "Missing matches",
            value: formatCount(
              Object.values(payload?.missing.byReason ?? {}).reduce(
                (sum, count) => sum + count,
                0,
              ),
            ),
            note: "Counted by reason, never zero-filled",
          },
          {
            label: "Expected delivery intervals",
            value: formatCount(summary?.expectedIntervals ?? 0),
            note: "Computed from the window and detected resolution",
          },
          {
            label: "Matched actual observations",
            value: `${formatCount(summary?.matchedActualHalfHours ?? 0)} / ${formatCount(summary?.expectedActualHalfHours ?? 0)}`,
            note: "FUELHH half-hours represented",
          },
          {
            label: "Alignment method",
            value: meta?.alignment?.method ?? "Not available",
            note: meta?.alignment
              ? `${meta.alignment.actualsPerForecastInterval ?? "—"} actual(s) per forecast interval · ${formatCount(meta.alignment.affectedIntervals)} aggregated`
              : undefined,
          },
          {
            label: "Forecast cutoff",
            value: meta?.selection?.rule ?? cutoffRuleLabel(),
            note: `${meta?.selection?.status === "assumption" ? "Assumption" : "Confirmed"} · latest publish at or before`,
          },
          {
            label: "Time resolution — WINDFOR / FUELHH",
            value: `${meta?.alignment?.forecastResolutionMinutes ?? "—"} / ${meta?.alignment?.actualResolutionMinutes ?? "—"} min`,
            note: "Detected from data",
          },
          {
            label: "Data freshness",
            value: formatZonedTime(meta?.retrievedAt, "Europe/London"),
          },
          {
            label: "Validation checks",
            value: checksPassed ? "All passed" : "See details",
            note: `${data.quality.checks.filter((check) => check.passed).length}/${data.quality.checks.length} passed`,
          },
        ]
      : emptyQualityItems();

  const kpiContext = (n: number | undefined, expected: number | undefined) =>
    n === undefined
      ? "Loading…"
      : `n = ${formatCount(n)} of ${formatCount(expected ?? 0)} intervals`;

  return (
    <>
      <TopBar title="Forecast Analysis" dataStatus={dataStatus} />

      <PageContainer>
        <FilterBar
          summary={
            <>
              <SummaryChip>{dayLabel}</SummaryChip>
              <span className="inline-flex h-[22px] items-center gap-1 rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
                {cutoffRuleLabel()}
                <AssumptionBadge />
              </span>
              <SummaryChip>
                {meta?.alignment?.method ?? "Alignment pending"}
              </SummaryChip>
            </>
          }
          onReset={() => setDay(MIN_DAY)}
          resetDisabled={day === MIN_DAY}
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              title="Recompute from Elexon and bypass the prepared cache"
            >
              <IconRetry
                size={14}
                className={isRefreshing ? "animate-spin" : ""}
              />{" "}
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </span>
            </Button>
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Delivery day" htmlFor="analysis-day">
              <DateInput
                id="analysis-day"
                value={day}
                min={MIN_DAY}
                max={MAX_DAY}
                onChange={(event) => setDay(event.target.value || MIN_DAY)}
                className="w-[160px]"
              />
            </Field>
            <div className="flex items-center gap-1.5 pb-0.5">
              <Button
                size="sm"
                aria-label="Previous delivery day"
                onClick={() => setDay(shiftDay(day, -1))}
                disabled={day <= MIN_DAY}
                className="h-9 w-9 px-0 md:h-9"
              >
                <IconChevronLeft size={15} />
              </Button>
              <Button
                size="sm"
                aria-label="Next delivery day"
                onClick={() => setDay(shiftDay(day, 1))}
                disabled={day >= MAX_DAY}
                className="h-9 w-9 px-0 md:h-9"
              >
                <IconChevronRight size={15} />
              </Button>
            </div>
            <p className="max-w-[54ch] pb-1 text-[11px] leading-4 text-text-tertiary">
              Each forecast interval is compared with the mean of the FUELHH
              half-hours that exactly cover it. A missing half-hour excludes the
              interval; nothing is interpolated. The selection rule does not
              change when you change day.
            </p>
          </div>
        </FilterBar>

        {!busy && loadState === "error" ? (
          <StateBlock
            kind="error"
            title="Forecast analysis unavailable"
            description={
              data
                ? `${errorMessage ?? "The last refresh failed."} Showing the last successfully computed results from ${formatZonedTime(lastSuccessAt, "Europe/London")}; they are not marked as current.`
                : (errorMessage ?? "The backend could not be reached.")
            }
            action={
              <button
                type="button"
                onClick={handleRefresh}
                className="h-9 rounded-sm border border-border-default bg-surface px-3 text-[11px] font-medium text-text-primary hover:bg-surface-subtle"
              >
                Retry
              </button>
            }
          />
        ) : null}

        <section aria-labelledby="accuracy-heading">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-0.5">
            <div>
              <h2
                id="accuracy-heading"
                className="text-section-heading font-semibold leading-section-heading text-text-primary"
              >
                Forecast accuracy
              </h2>
              <p className="text-caption leading-caption text-text-tertiary">
                Matched intervals only · January 2026 delivery ·{" "}
                {summary?.unit ?? "MW"}
              </p>
            </div>
            <p className="text-[11px] leading-4 text-text-tertiary">
              Neutral status: no accuracy thresholds agreed
            </p>
          </div>

          <KpiStrip label="Forecast accuracy metrics, January 2026">
            <KpiCell>
              <KpiStat
                label="MAE"
                value={
                  summary?.mae === null || summary?.mae === undefined
                    ? PLACEHOLDER
                    : formatCount(summary.mae)
                }
                unit="MW"
                context={kpiContext(
                  summary?.matchedIntervals,
                  summary?.expectedIntervals,
                )}
                tooltip={{
                  definition:
                    "Mean absolute error: the typical size of the forecast miss, ignoring direction. Lower is better.",
                  formula: "MAE = (1/n) Σ |F − A|",
                  unit: "MW",
                }}
              />
            </KpiCell>
            <KpiCell>
              <KpiStat
                label="RMSE"
                value={
                  summary?.rmse === null || summary?.rmse === undefined
                    ? PLACEHOLDER
                    : formatCount(summary.rmse)
                }
                unit="MW"
                context={kpiContext(
                  summary?.matchedIntervals,
                  summary?.expectedIntervals,
                )}
                tooltip={{
                  definition:
                    "Root mean square error: like MAE but penalises large misses more heavily.",
                  formula: "RMSE = √((1/n) Σ (F − A)²)",
                  unit: "MW",
                }}
              />
            </KpiCell>
            <KpiCell>
              <KpiStat
                label="Bias"
                value={
                  summary?.bias === null || summary?.bias === undefined ? (
                    PLACEHOLDER
                  ) : (
                    <>
                      {formatSignedMw(summary.bias).sign}
                      {formatSignedMw(summary.bias).abs}
                    </>
                  )
                }
                unit="MW (signed)"
                context={`${biasDirection} · n = ${formatCount(summary?.matchedIntervals ?? 0)}`}
                align="right"
                tooltip={{
                  definition:
                    "Mean signed error. Positive means the forecast was above actual on average; negative means below.",
                  formula: "Bias = (1/n) Σ (F − A)",
                  unit: "MW, signed",
                }}
              />
            </KpiCell>
            <KpiCell>
              <KpiStat
                label="Matched coverage"
                value={formatPercent(summary?.coveragePercent ?? null)}
                context={`${formatCount(summary?.matchedIntervals ?? 0)} / ${formatCount(summary?.expectedIntervals ?? 0)} hourly intervals`}
                align="right"
                tooltip={{
                  definition:
                    "Share of January delivery intervals with an eligible forecast and complete actual coverage.",
                  formula: "n_matched ÷ n_expected",
                  unit: "% and counts",
                }}
              />
            </KpiCell>
          </KpiStrip>
        </section>

        <ChartPanel
          title={`Actual vs eligible forecast — ${dayLabel}`}
          description={`Delivery intervals on ${dayLabel}, Europe/London. The forecast is the latest WINDFOR publication at or before D‑1 09:00 London; actual is the mean of the FUELHH half-hours covering each hourly interval. Hatched bands are unmatched intervals; no interpolation.`}
          state={
            busy && !data
              ? "loading"
              : loadState === "error" && !data
                ? "error"
                : "ready"
          }
          stateMessage={errorMessage ?? undefined}
          actions={
            <Link
              href="/methodology#alignment"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border-default bg-surface px-2.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-subtle"
            >
              Alignment method
              <IconArrowRight size={12} />
            </Link>
          }
          legend={[
            { label: "Actual (FUELHH)", kind: "line", color: "actual" },
            {
              label: "Day-ahead forecast (WINDFOR)",
              kind: "line",
              color: "forecast",
            },
            {
              label: "Missing / unmatched interval",
              kind: "band",
              color: "missing",
            },
          ]}
        >
          <TimeSeriesChart
            series={chartSeries}
            domain={chartSeries.length > 0 ? domain : undefined}
            missingRanges={missingRanges}
            ticks={["00:00", "06:00", "12:00", "18:00", "24:00"]}
            xTitle={`Delivery time (Europe/London) · ${dayLabel}`}
            emptyTitle={`No matched forecast data for ${dayLabel}`}
            emptyDescription="The day view plots once this delivery day has an eligible forecast and complete actual coverage."
            ariaLabel={`Actual versus eligible day-ahead wind forecast for ${dayLabel}. ${dayMatched} of ${dayExpected} hourly intervals matched.`}
          />
        </ChartPanel>

        <section
          aria-label="Error analysis"
          className="grid grid-cols-1 gap-5 xl:grid-cols-12"
        >
          <div className="xl:col-span-7">
            <ChartPanel
              title={`Forecast error (F − A) — ${dayLabel}`}
              description="Signed error for the selected delivery day. Above zero is over-forecast; below zero is under-forecast. Only matched intervals are plotted."
              state={
                busy && !data
                  ? "loading"
                  : loadState === "error" && !data
                    ? "error"
                    : "ready"
              }
              stateMessage={errorMessage ?? undefined}
              legend={[
                {
                  label: "Over-forecast",
                  kind: "area",
                  color: "positive",
                },
                {
                  label: "Under-forecast",
                  kind: "area",
                  color: "negative",
                },
                {
                  label: "Forecast = actual",
                  kind: "line",
                  color: "zero",
                  dashed: true,
                },
              ]}
            >
              <ErrorChart
                bars={errorBars}
                domain={errorBars.length > 0 ? domain : undefined}
                ticks={["00:00", "06:00", "12:00", "18:00", "24:00"]}
                xTitle={`Delivery time (Europe/London) · ${dayLabel}`}
                emptyTitle={`No error data for ${dayLabel}`}
                emptyDescription="Error appears when the selected day has matched forecast and actual intervals."
                ariaLabel={`Forecast error for ${dayLabel}. ${errorBars.length} matched intervals.`}
              />
            </ChartPanel>
          </div>

          <div className="xl:col-span-5">
            <Panel
              title="Largest errors"
              subtitle="Computed from matched intervals on the selected day. Not curated."
              action={
                <StatusChip
                  variant="neutral"
                  label={`${formatCount(largestErrors.length)} of ${formatCount(dayMatched)}`}
                />
              }
              footer={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-status-neutral"
                    aria-hidden="true"
                  />
                  Ranked by absolute error (F − A)
                </span>
              }
              className="h-full"
            >
              {largestErrors.length === 0 ? (
                <StateBlock
                  kind="empty"
                  title="No computed errors"
                  description="Over- and under-forecast leaders appear once matched intervals exist for this day."
                  compact
                  className="py-8"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <caption className="sr-only">
                      Largest absolute forecast errors for {dayLabel}
                    </caption>
                    <thead>
                      <tr className="border-b border-border-subtle text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                        <th scope="col" className="pb-2 pr-3">
                          Delivery interval
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-right">
                          Error
                        </th>
                        <th scope="col" className="pb-2 text-right">
                          Direction
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {largestErrors.map((interval) => {
                        const signed = formatSignedMw(interval.error);
                        return (
                          <tr key={interval.deliveryTime}>
                            <td className="py-2 pr-3 font-mono-ui text-[11px] text-text-primary">
                              {formatZonedTime(
                                interval.deliveryTime,
                                "Europe/London",
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right text-table-cell tabular-nums text-text-primary">
                              {signed.sign}
                              {signed.abs}{" "}
                              <span className="text-[10px] text-text-tertiary">
                                MW
                              </span>
                            </td>
                            <td className="py-2 text-right text-[11px] text-text-secondary">
                              {(interval.error ?? 0) > 0
                                ? "Over-forecast"
                                : (interval.error ?? 0) < 0
                                  ? "Under-forecast"
                                  : "On forecast"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </section>

        <section
          aria-label="Missing data and method"
          className="grid grid-cols-1 gap-5 xl:grid-cols-12"
        >
          <div className="xl:col-span-7">
            <Panel
              title="Daily results"
              subtitle="Every January delivery day. Select a row to open its charts."
              action={
                <span className="text-[11px] text-text-tertiary">
                  {formatCount(daily.length)} days
                </span>
              }
              footer={
                <span>
                  Coverage is matched hourly intervals ÷ expected hourly
                  intervals. Empty metrics show “{PLACEHOLDER}”, never zero.
                </span>
              }
              bodyClassName="p-0"
            >
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[620px] text-left">
                  <caption className="sr-only">
                    Daily forecast accuracy for January 2026
                  </caption>
                  <thead className="sticky top-0 z-10 bg-surface-subtle">
                    <tr className="border-b border-border-default text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                      <th scope="col" className="px-3 py-2.5">
                        Delivery day
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Matched / expected
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Coverage
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        MAE
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        RMSE
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Bias
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Missing
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {daily.map((row) => {
                      const selected = row.deliveryDate === day;
                      const missing = Object.values(
                        row.missingByReason,
                      ).reduce((sum, count) => sum + count, 0);
                      const signed =
                        row.bias === null
                          ? null
                          : formatSignedMw(row.bias);
                      return (
                        <tr
                          key={row.deliveryDate}
                          className={
                            selected ? "bg-accent-050" : "hover:bg-surface-subtle"
                          }
                        >
                          <th scope="row" className="px-3 py-2 font-normal">
                            <button
                              type="button"
                              onClick={() => setDay(row.deliveryDate)}
                              aria-pressed={selected}
                              className="text-left text-table-cell font-medium text-accent-600 hover:underline"
                            >
                              {formatDeliveryDay(
                                `${row.deliveryDate}T00:00:00Z`,
                              )}
                            </button>
                          </th>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-primary">
                            {formatCount(row.matchedIntervals)} /{" "}
                            {formatCount(row.expectedIntervals)}
                          </td>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-primary">
                            {formatPercent(row.coveragePercent)}
                          </td>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-primary">
                            {formatCount(row.mae)}
                          </td>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-primary">
                            {formatCount(row.rmse)}
                          </td>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-primary">
                            {signed ? `${signed.sign}${signed.abs}` : PLACEHOLDER}
                          </td>
                          <td className="px-3 py-2 text-right text-table-cell tabular-nums text-text-secondary">
                            {formatCount(missing)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="xl:col-span-5">
            <Panel
              title="Missing data"
              subtitle="Intervals excluded from every metric, counted by reason."
              action={
                <StatusChip
                  variant={
                    Object.keys(payload?.missing.byReason ?? {}).length > 0
                      ? "warning"
                      : "favorable"
                  }
                  label={
                    Object.keys(payload?.missing.byReason ?? {}).length > 0
                      ? "Partial"
                      : "Complete"
                  }
                />
              }
              footer={
                <Link
                  href="/methodology#alignment"
                  className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                >
                  How alignment works
                  <IconArrowRight size={12} />
                </Link>
              }
            >
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  January 2026
                </h3>
                {Object.keys(payload?.missing.byReason ?? {}).length === 0 ? (
                  <p className="mt-2 text-table-cell text-text-secondary">
                    No unmatched intervals reported.
                  </p>
                ) : (
                  <dl className="mt-2 space-y-1.5">
                    {Object.entries(payload?.missing.byReason ?? {}).map(
                      ([reason, count]) => (
                        <div
                          key={reason}
                          className="flex items-baseline justify-between gap-3 text-table-cell"
                        >
                          <dt className="text-text-secondary">
                            {missingReasonLabel(reason)}
                          </dt>
                          <dd className="tabular-nums text-text-primary">
                            {formatCount(count)}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}

                <div className="mt-4 border-t border-border-subtle pt-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                    {dayLabel}
                  </h3>
                  {Object.keys(dayMissing).length === 0 ? (
                    <p className="mt-2 text-table-cell text-text-secondary">
                      All intervals matched on this day.
                    </p>
                  ) : (
                    <dl className="mt-2 space-y-1.5">
                      {Object.entries(dayMissing).map(([reason, count]) => (
                        <div
                          key={reason}
                          className="flex items-baseline justify-between gap-3 text-table-cell"
                        >
                          <dt className="text-text-secondary">
                            {missingReasonLabel(reason)}
                          </dt>
                          <dd className="tabular-nums text-text-primary">
                            {formatCount(count)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>

                <dl className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-[11px] leading-4">
                  <div>
                    <dt className="text-text-tertiary">Selection</dt>
                    <dd className="text-text-secondary">
                      Latest WINDFOR publish at or before{" "}
                      {meta?.selection?.rule ?? cutoffRuleLabel()}{" "}
                      <AssumptionBadge />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-tertiary">Alignment</dt>
                    <dd className="text-text-secondary">
                      {meta?.alignment?.description ??
                        "Each forecast interval is matched to the actual half-hours that cover it completely."}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-tertiary">Affected intervals</dt>
                    <dd className="tabular-nums text-text-secondary">
                      {formatCount(meta?.alignment?.affectedIntervals ?? 0)}{" "}
                      hourly intervals use an aggregated mean of{" "}
                      {meta?.alignment?.actualsPerForecastInterval ?? "—"}{" "}
                      half-hours.
                    </dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </div>
        </section>

        <DataQualityPanel
          items={qualityItems}
          summary={dataStatus}
          state={busy && !data ? "loading" : "ready"}
        />
      </PageContainer>
    </>
  );
}
