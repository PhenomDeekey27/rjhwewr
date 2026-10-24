"use client";

import { useMemo, useState } from "react";
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
import { FilterBar } from "@/components/ui/FilterBar";
import { DateInput, Field } from "@/components/ui/controls";
import { PLACEHOLDER } from "@/lib/format";
import { cutoffRuleLabel } from "@/lib/config";
import { IconArrowRight, IconTable } from "@/components/ui/icons";

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
  "Actual (FUELHH, navy) against the eligible day-ahead forecast (WINDFOR, teal) by delivery time. Forecasts here were published before the D‑1 09:00 London cutoff. Lines break at unmatched intervals; nothing is interpolated.";

const ERROR_DESCRIPTION =
  "Signed forecast error, F − A, for each interval. Above the dashed baseline is over-forecast; below is under-forecast. Both directions are errors.";

export default function OverviewPage() {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const filtersActive = from !== DEFAULT_FROM || to !== DEFAULT_TO;

  const rangeLabel = useMemo(
    () => `${shortDay(from)} – ${shortDay(to)} 2026`,
    [from, to],
  );

  return (
    <>
      <TopBar
        title="Overview"
        dataStatus={{ label: "No data loaded", variant: "neutral" }}
      />

      <PageContainer>
        <FilterBar
          summary={<SummaryChip>{rangeLabel}</SummaryChip>}
          onReset={() => {
            setFrom(DEFAULT_FROM);
            setTo(DEFAULT_TO);
          }}
          resetDisabled={!filtersActive}
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
          title="Actual vs eligible day-ahead forecast"
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
            { label: "Actual (FUELHH)", kind: "line", color: "actual" },
            { label: "Day-ahead forecast (WINDFOR)", kind: "line", color: "forecast" },
            { label: "Missing / unmatched interval", kind: "band", color: "missing" },
          ]}
        >
          <TimeSeriesChart />
        </ChartPanel>

        <ChartPanel
          title="Forecast error (F − A)"
          description={ERROR_DESCRIPTION}
          legend={[
            { label: "Over-forecast", kind: "area", color: "positive" },
            { label: "Under-forecast", kind: "area", color: "negative" },
            { label: "Forecast = actual", kind: "line", color: "zero", dashed: true },
          ]}
        >
          <ErrorChart />
        </ChartPanel>

        <section
          aria-label="Data quality and cutoff rule"
          className="grid grid-cols-1 gap-5 xl:grid-cols-12"
        >
          <div className="xl:col-span-8">
            <DataQualityPanel
              items={emptyQualityItems()}
              summary={{ label: "No data loaded", variant: "neutral" }}
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
