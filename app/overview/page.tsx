"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  KpiCell,
  KpiStat,
  KpiStrip,
  UnavailableKpi,
} from "@/components/ui/KpiStat";
import { Panel } from "@/components/ui/Panel";
import { AssumptionBadge } from "@/components/ui/AssumptionBadge";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { TimeSeriesChart, ErrorChart } from "@/components/charts/TimeSeriesChart";
import { DataQualityPanel, emptyQualityItems } from "@/components/dashboard/DataQualityPanel";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { StateBlock } from "@/components/ui/StateBlock";
import { FilterBar } from "@/components/ui/FilterBar";
import { DateInput, Field } from "@/components/ui/controls";
import { PLACEHOLDER } from "@/lib/format";
import { cutoffRuleLabel } from "@/lib/config";
import {
  fetchWindFor,
  fetchFuelHh,
  clearCache,
  type Envelope,
  type WindForRecord,
  type FuelHhRecord,
} from "@/lib/api";
import { Button } from "@/components/ui/controls";
import { IconArrowRight, IconTable, IconRetry } from "@/components/ui/icons";

const DEFAULT_FROM = "2026-01-01";
const DEFAULT_TO = "2026-01-31";

function shortDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

const TIMESERIES_DESCRIPTION =
  "Raw WINDFOR forecast records (teal, multiple per delivery interval) and FUELHH actual outturn (navy) for January 2026. Forecast selection (D‑1 09:00 London cutoff) and alignment are not applied at this stage — lines show all retrieved records.";

const ERROR_DESCRIPTION =
  "Signed forecast error (F − A) requires matched forecast and actual intervals. Stage 3 provides raw records only; forecast selection and error computation arrive in Stage 4.";

function toSeriesPoints(
  records: Array<{ startTime: string; generation: number | null }>,
): Array<{ t: number; v: number | null }> {
  return records
    .filter((r) => r.generation !== null && r.generation !== undefined)
    .map((r) => ({
      t: Date.parse(r.startTime),
      v: r.generation!,
    }));
}

function computeDomain(
  series: Array<{ data: Array<{ t: number; v: number | null }> }>,
): [number, number] | undefined {
  const allTimes = series.flatMap((s) => s.data.map((p) => p.t));
  if (allTimes.length === 0) return undefined;
  return [Math.min(...allTimes), Math.max(...allTimes)];
}

// Downsample series for chart display to avoid SVG performance issues with 18k+ points.
// Uses Largest-Triangle-Three-Buckets (LTTB) algorithm for meaningful downsampling.
function downsampleSeries(
  points: Array<{ t: number; v: number | null }>,
  maxPoints: number,
): Array<{ t: number; v: number | null }> {
  const validPoints = points.filter((p) => p.v !== null && p.v !== undefined);
  if (validPoints.length <= maxPoints) return validPoints;

  // Simple LTTB-like downsampling: divide into buckets, pick max/min/median
  const bucketSize = validPoints.length / maxPoints;
  const downsampled: Array<{ t: number; v: number | null }> = [];

  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const bucket = validPoints.slice(start, end);
    if (bucket.length === 0) continue;

    // Pick the point with maximum absolute deviation from bucket mean (preserves extremes)
    const mean = bucket.reduce((sum, p) => sum + p.v!, 0) / bucket.length;
    let maxDev = -1;
    let selected = bucket[0];
    for (const p of bucket) {
      const dev = Math.abs(p.v! - mean);
      if (dev > maxDev) {
        maxDev = dev;
        selected = p;
      }
    }
    downsampled.push(selected);
  }
  return downsampled;
}

const CHART_MAX_POINTS = 500; // Display limit for smooth SVG rendering

export default function OverviewPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const filtersActive = from !== DEFAULT_FROM || to !== DEFAULT_TO;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [windforData, setWindforData] = useState<Envelope<WindForRecord> | null>(null);
  const [fuelhhData, setFuelhhData] = useState<Envelope<FuelHhRecord> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [windforResult, fuelhhResult] = await Promise.all([fetchWindFor(), fetchFuelHh()]);
      setWindforData(windforResult);
      setFuelhhData(fuelhhResult);
      setStatus("success");
      setErrorMessage(null);
    } catch (error) {
      setWindforData(null);
      setFuelhhData(null);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Backend unavailable");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadData();
    })();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    clearCache("/api/elexon/windfor");
    clearCache("/api/elexon/fuelhh");
    loadData();
  }, [loadData]);

  const windforRecordCount = windforData?.meta.recordCounts.WINDFOR ?? windforData?.quality.accepted ?? windforData?.data.length ?? 0;
  const fuelhhRecordCount = fuelhhData?.meta.recordCounts.FUELHH ?? fuelhhData?.quality.accepted ?? fuelhhData?.data.length ?? 0;
  const windforRejected = windforData?.quality.rejected ?? 0;
  const fuelhhRejected = fuelhhData?.quality.rejected ?? 0;
  const windforNullGen = windforData?.quality.nullGeneration ?? 0;
  const fuelhhNullGen = fuelhhData?.quality.nullGeneration ?? 0;
  const allChecksPassed =
    ((windforData?.quality.checks.length ?? 0) > 0 &&
      windforData?.quality.checks.every((check) => check.passed) &&
      (fuelhhData?.quality.checks.length ?? 0) > 0 &&
      fuelhhData?.quality.checks.every((check) => check.passed)) ??
    false;
  const dataStatus =
    status === "loading"
      ? { label: "Loading", variant: "neutral" as const }
      : status === "error"
        ? { label: "Error", variant: "error" as const }
        : allChecksPassed
          ? {
              label: `Loaded · ${windforData?.meta.retrievedAt ?? fuelhhData?.meta.retrievedAt ?? ""}`.trim(),
              variant: "favorable" as const,
            }
          : { label: "Partial data", variant: "warning" as const };

  const qualityItems =
    status === "success" && windforData && fuelhhData
      ? [
          {
            label: "Forecast records retrieved (WINDFOR)",
            value: windforRecordCount.toLocaleString("en-GB"),
          },
          {
            label: "Actual records retrieved (FUELHH)",
            value: fuelhhRecordCount.toLocaleString("en-GB"),
          },
          {
            label: "Expected delivery intervals",
            value: "—",
            note: "Not provided by backend",
          },
          {
            label: "Matched intervals",
            value: "—",
            note: "Forecast selection arrives in Stage 4",
          },
          {
            label: "Missing matches",
            value: "—",
            note: "Forecast selection arrives in Stage 4",
          },
          {
            label: "Null or invalid values",
            value: (windforNullGen + fuelhhNullGen + windforRejected + fuelhhRejected).toLocaleString("en-GB"),
            note: `${windforData.quality.rejectedReasons.outsideDeliveryWindow ?? 0} outside delivery window`,
          },
          {
            label: "Time resolution — WINDFOR",
            value: windforData.meta.observedResolutions.WINDFOR?.delivery.label ?? "Not available",
            note: "Detected from data",
          },
          {
            label: "Time resolution — FUELHH",
            value: fuelhhData.meta.observedResolutions.FUELHH?.delivery.label ?? "Not available",
            note: "Detected from data",
          },
          {
            label: "Publication window fetched",
            value:
              windforData.meta.publicationWindow?.start && windforData.meta.publicationWindow?.endExclusive
                ? `${windforData.meta.publicationWindow.start} to ${windforData.meta.publicationWindow.endExclusive}`
                : "Not available",
          },
          {
            label: "Data freshness",
            value: windforData.meta.retrievedAt ?? fuelhhData.meta.retrievedAt ?? "Not available",
            note: "Retrieved at",
          },
          {
            label: "Validation checks",
            value: allChecksPassed ? "All passed" : "See details",
            note: `${(windforData.quality.checks.filter((c) => c.passed).length + fuelhhData.quality.checks.filter((c) => c.passed).length)}/${windforData.quality.checks.length + fuelhhData.quality.checks.length} passed`,
          },
        ]
      : undefined;

  const windforSeries = useMemo(() => {
    if (!windforData) return null;
    const points = toSeriesPoints(windforData.data);
    if (points.length === 0) return null;
    // Downsample for chart performance (18k+ points is too many for SVG)
    const displayPoints = downsampleSeries(points, CHART_MAX_POINTS);
    return {
      name: "WINDFOR (all forecasts, downsampled for display)",
      color: "var(--color-chart-forecast)",
      data: displayPoints,
    };
  }, [windforData]);

  const fuelhhSeries = useMemo(() => {
    if (!fuelhhData) return null;
    const points = toSeriesPoints(fuelhhData.data);
    if (points.length === 0) return null;
    return {
      name: "FUELHH (actual)",
      color: "var(--color-chart-actual)",
      data: points,
    };
  }, [fuelhhData]);

  const chartSeries = useMemo(() => {
    const series = [windforSeries, fuelhhSeries].filter(
      (s): s is NonNullable<typeof s> => s !== null,
    );
    if (series.length === 0) return { series: [], domain: undefined };
    const domain = computeDomain(series);
    return { series, domain };
  }, [windforSeries, fuelhhSeries]);

  const rangeLabel = useMemo(
    () => `${shortDay(from)} – ${shortDay(to)} 2026`,
    [from, to],
  );

  return (
    <>
      <TopBar title="Overview" dataStatus={dataStatus} />

      <PageContainer>
        {status === "error" ? (
          <StateBlock
            kind="error"
            title="Backend unavailable"
            description={errorMessage ?? "The backend could not be reached."}
          />
        ) : null}
        <FilterBar
          summary={<SummaryChip>{rangeLabel}</SummaryChip>}
          onReset={() => {
            setFrom(DEFAULT_FROM);
            setTo(DEFAULT_TO);
          }}
          resetDisabled={!filtersActive}
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              title="Refresh data from backend"
            >
              <IconRetry size={14} className={isRefreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{isRefreshing ? "Refreshing…" : "Refresh"}</span>
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <Field label="From delivery day" htmlFor="overview-from">
              <DateInput
                id="overview-from"
                value={from}
                min={DEFAULT_FROM}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className="sm:w-[150px]"
              />
            </Field>
            <Field label="To delivery day" htmlFor="overview-to">
              <DateInput
                id="overview-to"
                value={to}
                min={from}
                max={DEFAULT_TO}
                onChange={(event) => setTo(event.target.value)}
                className="sm:w-[150px]"
              />
            </Field>
            <p className="col-span-2 max-w-[46ch] text-[11px] leading-4 text-text-tertiary sm:mb-2 sm:ml-2">
              Delivery-time range within January 2026. Forecast selection is
              fixed by the publication cutoff, not by this range.
            </p>
          </div>
        </FilterBar>

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
                Matched intervals only · January 2026 delivery
              </p>
            </div>
            <p className="text-[11px] leading-4 text-text-tertiary">
              Neutral status: no accuracy thresholds agreed
            </p>
          </div>

          <KpiStrip>
            <KpiCell>
              <UnavailableKpi
                label="MAE"
                unit="MW"
                context="n = — matched intervals · awaits data"
                tooltip={{
                  definition:
                    "Mean absolute error: the typical size of the forecast miss, ignoring direction. Lower is better.",
                  formula: "MAE = (1/n) Σ |F − A|",
                  unit: "MW",
                }}
              />
            </KpiCell>
            <KpiCell>
              <UnavailableKpi
                label="RMSE"
                unit="MW"
                context="n = — matched intervals · awaits data"
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
                  <span className="text-text-tertiary">
                    {PLACEHOLDER}
                    <span className="sr-only">Not available</span>
                  </span>
                }
                unit="MW (signed)"
                context="+ over-forecast · − under-forecast · n = —"
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
              <UnavailableKpi
                label="Matched coverage"
                unit="%"
                context="— / — expected intervals"
                align="right"
                tooltip={{
                  definition:
                    "Share of January delivery intervals with both an eligible forecast and an actual value. Counts are shown beside the percentage.",
                  formula: "n_matched ÷ n_expected",
                  unit: "% and counts",
                }}
              />
            </KpiCell>
          </KpiStrip>
        </section>

        <ChartPanel
          title="Raw WINDFOR forecasts and FUELHH actuals"
          description={TIMESERIES_DESCRIPTION}
          actions={
            <Link
              href="/data-explorer"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border-default bg-surface px-2.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-subtle"
            >
              <IconTable size={13} />
              View as table
            </Link>
          }
          legend={[
            { label: "FUELHH actual", kind: "line", color: "actual" },
            { label: "WINDFOR forecasts (all)", kind: "line", color: "forecast" },
          ]}
        >
          <TimeSeriesChart
            series={chartSeries.series}
            domain={chartSeries.domain}
            emptyTitle="No forecast data loaded"
            emptyDescription="Raw WINDFOR and FUELHH records will plot here once January 2026 data is available."
            ariaLabel="Raw WINDFOR forecast records and FUELHH actual generation for January 2026. Forecast selection not applied."
          />
        </ChartPanel>

        <ChartPanel
          title="Forecast error (F − A) — not available in Stage 3"
          description={ERROR_DESCRIPTION}
          legend={[
            { label: "Over-forecast", kind: "area", color: "positive" },
            { label: "Under-forecast", kind: "area", color: "negative" },
            { label: "Forecast = actual", kind: "line", color: "zero", dashed: true },
          ]}
        >
          <ErrorChart
            emptyTitle="Error data requires forecast selection"
            emptyDescription="Signed error appears once eligible forecasts are matched to actuals (Stage 4)."
            ariaLabel="Forecast error for January 2026. Not available in Stage 3."
          />
        </ChartPanel>

        <section
          aria-label="Data quality and cutoff rule"
          className="grid grid-cols-1 gap-5 xl:grid-cols-12"
        >
          <div className="xl:col-span-8">
            <DataQualityPanel
              items={qualityItems ?? emptyQualityItems()}
              summary={dataStatus}
              state={status === "loading" ? "loading" : "ready"}
            />
          </div>

          <div className="xl:col-span-4">
            <Panel
              title="Cutoff rule"
              subtitle="How the day-ahead forecast is selected."
              footer={
                <Link
                  href="/methodology#forecast-selection-rule"
                  className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                >
                  Read the selection rule
                  <IconArrowRight size={12} />
                </Link>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-section-heading font-semibold leading-section-heading text-text-primary">
                  {cutoffRuleLabel()}
                </p>
                <AssumptionBadge />
              </div>

              <ul className="mt-3 space-y-2 text-table-cell leading-5 text-text-secondary">
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-600" />
                  <span>
                    Use the latest forecast for each delivery interval with{" "}
                    <code className="font-mono-ui text-[12px] text-text-primary">
                      publishTime
                    </code>{" "}
                    at or before the cutoff.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-600" />
                  <span>
                    Forecasts published after the cutoff are never selected.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-600" />
                  <span>
                    No eligible forecast means the interval is unmatched. It is
                    never back-filled with a later forecast.
                  </span>
                </li>
              </ul>

              <p className="mt-4 border-t border-border-subtle pt-3 text-[11px] leading-4 text-text-tertiary">
                Proposed business rule, not a confirmed gate. Deliveries span
                00:00 1 January to 24:00 31 January 2026 (London); the
                publication window includes late December 2025.
              </p>
            </Panel>
          </div>
        </section>
      </PageContainer>
    </>
  );
}
