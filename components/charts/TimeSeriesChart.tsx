"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface SeriesPoint {
  t: number;
  v: number | null;
}

export interface ChartSeries {
  name: string;
  /** CSS colour value — callers use chart tokens from globals.css. */
  color: string;
  data: SeriesPoint[];
}

interface ChartFrameProps {
  yLabel: string;
  xTitle: string;
  ticks: string[];
  variant: "generation" | "error";
  ariaLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  isEmpty: boolean;
  children?: React.ReactNode;
  className?: string;
}

function ChartFrame({
  yLabel,
  xTitle,
  ticks,
  variant,
  ariaLabel,
  emptyTitle,
  emptyDescription,
  isEmpty,
  children,
  className,
}: ChartFrameProps) {
  return (
    <figure
      className={cn("m-0 w-full", className)}
      aria-label={ariaLabel}
      role={isEmpty ? "group" : "img"}
    >
      <div
        className={cn(
          "relative w-full",
          isEmpty
            ? "h-[220px] sm:h-[250px] xl:h-[270px]"
            : "h-[264px] sm:h-[300px] xl:h-[340px]",
        )}
      >
        <div className="absolute bottom-9 left-0 top-0 flex w-8 items-center justify-center">
          <span className="rotate-180 whitespace-nowrap text-[10px] tracking-[0.01em] text-text-tertiary [writing-mode:vertical-rl]">
            {yLabel}
          </span>
        </div>

        <div className="absolute bottom-9 left-8 right-0 top-0">
          <div className="relative h-full border-b border-l border-border-subtle">
            {[0, 25, 50, 75].map((top) => (
              <div
                key={top}
                className="absolute inset-x-0 border-t border-border-subtle/70"
                style={{ top: `${top}%` }}
                aria-hidden="true"
              />
            ))}

            {variant === "generation" ? (
              <span className="absolute bottom-0.5 left-1.5 text-[10px] tabular-nums text-text-tertiary">
                0
              </span>
            ) : (
              <>
                <div
                  className="absolute inset-x-0 top-1/2 border-t border-dashed border-chart-zero"
                  aria-hidden="true"
                />
                <span className="absolute left-1.5 top-1 inline-flex items-center gap-1 text-[10px] font-medium text-status-error">
                  <span aria-hidden="true">▲</span> Over-forecast
                </span>
                <span className="absolute bottom-1 left-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-status-warning">
                  <span aria-hidden="true">▼</span> Under-forecast
                </span>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary">
                  0
                </span>
              </>
            )}

            {children}

            {isEmpty ? (
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <div className="max-w-[36ch] rounded-sm border border-border-subtle bg-surface px-4 py-3 text-center">
                  <p className="text-label font-semibold leading-label text-text-primary">
                    {emptyTitle}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-text-tertiary">
                    {emptyDescription}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="absolute bottom-5 left-8 right-0 flex items-center justify-between gap-1">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="whitespace-nowrap text-[10px] tabular-nums leading-4 text-text-tertiary"
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="absolute bottom-0 left-8 right-0 text-center text-[10px] leading-4 text-text-tertiary">
          {xTitle}
        </div>
      </div>
    </figure>
  );
}

function segmentsForSeries(
  data: SeriesPoint[],
  domain: [number, number],
  maxValue: number,
): string[] {
  const width = 1000;
  const height = 100;
  const segments: string[] = [];
  let current: string[] = [];

  data.forEach((point) => {
    if (point.v === null || point.v === undefined) {
      if (current.length > 0) {
        segments.push(current.join(" "));
        current = [];
      }
      return;
    }
    const x = ((point.t - domain[0]) / (domain[1] - domain[0])) * width;
    const y = height - (point.v / maxValue) * height;
    current.push(`${current.length === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  });

  if (current.length > 0) segments.push(current.join(" "));
  return segments;
}

export function TimeSeriesChart({
  series,
  domain,
  missingRanges,
  ticks = ["1 Jan", "8 Jan", "15 Jan", "22 Jan", "29 Jan"],
  xTitle = "Delivery time (Europe/London)",
  emptyTitle = "No forecast data loaded",
  emptyDescription = "Actual and eligible day-ahead generation will plot here once January 2026 records are available.",
  ariaLabel = "Actual wind generation versus eligible day-ahead forecast, January 2026. No data is loaded.",
}: {
  series?: ChartSeries[];
  domain?: [number, number];
  missingRanges?: Array<[number, number]>;
  ticks?: string[];
  xTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  ariaLabel?: string;
}) {
  const hasData = Boolean(series && series.length > 0 && domain);
  const values = hasData
    ? series!.flatMap((s) =>
        s.data
          .map((point) => point.v)
          .filter((value): value is number => typeof value === "number"),
      )
    : [];
  const maxValue = values.length > 0 ? Math.max(...values) * 1.08 : 0;

  return (
    <ChartFrame
      yLabel="Wind generation (MW)"
      xTitle={xTitle}
      ticks={ticks}
      variant="generation"
      ariaLabel={ariaLabel}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      isEmpty={!hasData || values.length === 0}
    >
      {hasData && values.length > 0 ? (
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {missingRanges?.map(([from, to]) => {
            const x =
              ((from - domain![0]) / (domain![1] - domain![0])) * 1000;
            const width =
              ((to - from) / (domain![1] - domain![0])) * 1000;
            return (
              <rect
                key={`${from}-${to}`}
                x={x}
                y={0}
                width={Math.max(1, width)}
                height={100}
                fill="var(--color-chart-missing)"
                opacity={0.18}
              />
            );
          })}
          {series!.flatMap((s) =>
            segmentsForSeries(s.data, domain!, maxValue).map((path, index) => (
              <path
                key={`${s.name}-${index}`}
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )),
          )}
        </svg>
      ) : null}
    </ChartFrame>
  );
}

export function ErrorChart({
  bars,
  domain,
  ticks = ["1 Jan", "8 Jan", "15 Jan", "22 Jan", "29 Jan"],
  xTitle = "Delivery time (Europe/London)",
  emptyTitle = "No error data loaded",
  emptyDescription = "Signed forecast error appears once matched forecast and actual intervals are available.",
  ariaLabel = "Forecast error, forecast minus actual, January 2026. No data is loaded.",
}: {
  bars?: Array<{ t: number; v: number | null }>;
  domain?: [number, number];
  ticks?: string[];
  xTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  ariaLabel?: string;
}) {
  const valid = (bars ?? []).filter(
    (bar): bar is { t: number; v: number } => typeof bar.v === "number",
  );
  const hasData = valid.length > 0 && Boolean(domain);
  const maxAbs = valid.length > 0 ? Math.max(...valid.map((bar) => Math.abs(bar.v))) : 0;

  return (
    <ChartFrame
      yLabel="Forecast error, F − A (MW)"
      xTitle={xTitle}
      ticks={ticks}
      variant="error"
      ariaLabel={ariaLabel}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      isEmpty={!hasData}
    >
      {hasData ? (
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {valid.map((bar, index) => {
            const x =
              ((bar.t - domain![0]) / (domain![1] - domain![0])) * 1000;
            const barWidth = Math.max(1.5, 700 / valid.length);
            const magnitude = (Math.abs(bar.v) / (maxAbs || 1)) * 48;
            const positive = bar.v >= 0;
            return (
              <rect
                key={index}
                x={x - barWidth / 2}
                y={positive ? 50 - magnitude : 50}
                width={barWidth}
                height={Math.max(0.6, magnitude)}
                fill={
                  positive
                    ? "var(--color-chart-error-positive)"
                    : "var(--color-chart-error-negative)"
                }
                opacity={0.82}
              />
            );
          })}
        </svg>
      ) : null}
    </ChartFrame>
  );
}
