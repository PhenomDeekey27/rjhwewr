"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/FilterBar";
import { DateInput, Field } from "@/components/ui/controls";
import { Button } from "@/components/ui/controls";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { ErrorChart, TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Panel } from "@/components/ui/Panel";
import { StateBlock } from "@/components/ui/StateBlock";
import { AssumptionBadge } from "@/components/ui/AssumptionBadge";
import { formatDeliveryDay } from "@/lib/format";
import {
  IconChevronLeft,
  IconChevronRight,
} from "@/components/ui/icons";

const MIN_DAY = "2026-01-01";
const MAX_DAY = "2026-01-31";

function shiftDay(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export default function ForecastAnalysisPage() {
  const [day, setDay] = useState(MIN_DAY);
  const dayLabel = formatDeliveryDay(`${day}T00:00:00Z`);
  const atStart = day <= MIN_DAY;
  const atEnd = day >= MAX_DAY;

  return (
    <>
      <TopBar
        title="Forecast Analysis"
        dataStatus={{ label: "No data loaded", variant: "neutral" }}
      />

      <PageContainer>
        <FilterBar
          summary={
            <>
              <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
                {dayLabel}
              </span>
              <span className="inline-flex h-[22px] items-center gap-1 rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
                D‑1 09:00 cutoff
                <AssumptionBadge />
              </span>
            </>
          }
          onReset={() => setDay(MIN_DAY)}
          resetDisabled={day === MIN_DAY}
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
                disabled={atStart}
                className="h-9 w-9 px-0 md:h-9"
              >
                <IconChevronLeft size={15} />
              </Button>
              <Button
                size="sm"
                aria-label="Next delivery day"
                onClick={() => setDay(shiftDay(day, 1))}
                disabled={atEnd}
                className="h-9 w-9 px-0 md:h-9"
              >
                <IconChevronRight size={15} />
              </Button>
            </div>
            <p className="max-w-[52ch] pb-1 text-[11px] leading-4 text-text-tertiary">
              Day view uses 30-minute delivery intervals. Forecasts are the
              latest published before D‑1 09:00 London; the selection does not
              change when you change day.
            </p>
          </div>
        </FilterBar>

        <ChartPanel
          title={`Actual vs eligible forecast — ${dayLabel}`}
          description={`Delivery intervals on ${dayLabel}, Europe/London. Forecasts published before the D‑1 09:00 London cutoff. Gaps are unmatched intervals; no interpolation.`}
          legend={[
            { label: "Actual (FUELHH)", kind: "line", color: "actual" },
            { label: "Day-ahead forecast (WINDFOR)", kind: "line", color: "forecast" },
            { label: "Missing / unmatched interval", kind: "band", color: "missing" },
          ]}
        >
          <TimeSeriesChart
            ticks={["00:00", "06:00", "12:00", "18:00", "24:00"]}
            xTitle={`Delivery time (Europe/London) · ${dayLabel}`}
            emptyTitle={`No forecast data for ${dayLabel}`}
            emptyDescription="The day view plots once this delivery day has eligible forecast intervals and actual outturn."
            ariaLabel={`Actual versus eligible day-ahead wind forecast for ${dayLabel}. No data is loaded.`}
          />
        </ChartPanel>

        <section
          aria-label="Error analysis"
          className="grid grid-cols-1 gap-5 xl:grid-cols-12"
        >
          <div className="xl:col-span-7">
            <ChartPanel
              title={`Forecast error (F − A) — ${dayLabel}`}
              description="Signed error for the selected delivery day. Above zero is over-forecast; below zero is under-forecast."
              legend={[
                { label: "Over-forecast", kind: "area", color: "positive" },
                { label: "Under-forecast", kind: "area", color: "negative" },
                { label: "Forecast = actual", kind: "line", color: "zero", dashed: true },
              ]}
            >
              <ErrorChart
                ticks={["00:00", "06:00", "12:00", "18:00", "24:00"]}
                xTitle={`Delivery time (Europe/London) · ${dayLabel}`}
                emptyTitle={`No error data for ${dayLabel}`}
                emptyDescription="Error appears when the selected day has matched forecast and actual intervals."
                ariaLabel={`Forecast error for ${dayLabel}. No data is loaded.`}
              />
            </ChartPanel>
          </div>

          <div className="xl:col-span-5">
            <Panel
              title="Largest errors"
              subtitle="Computed from matched intervals on the selected day. Not curated."
              footer={
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-neutral" aria-hidden="true" />
                  Awaiting computed results
                </span>
              }
              className="h-full"
            >
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border-subtle pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                <span>Delivery interval</span>
                <span className="text-right">Error</span>
                <span className="text-right">Direction</span>
              </div>
              <StateBlock
                kind="empty"
                title="No computed errors"
                description="Over- and under-forecast leaders appear once matched intervals exist for this day."
                compact
                className="py-8"
              />
              <div className="mt-2 border-t border-border-subtle pt-3 text-[11px] leading-4 text-text-tertiary">
                Ranking uses absolute error. Ties are not resolved until the
                backend returns the interval records.
              </div>
            </Panel>
          </div>
        </section>
      </PageContainer>
    </>
  );
}
