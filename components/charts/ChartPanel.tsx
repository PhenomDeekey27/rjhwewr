"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { StateBlock } from "@/components/ui/StateBlock";

export interface LegendItem {
  label: string;
  kind: "line" | "area" | "band";
  color?:
    | "actual"
    | "forecast"
    | "positive"
    | "negative"
    | "missing"
    | "zero";
  dashed?: boolean;
}

const legendColor: Record<NonNullable<LegendItem["color"]>, string> = {
  actual: "var(--color-chart-actual)",
  forecast: "var(--color-chart-forecast)",
  positive: "var(--color-chart-error-positive)",
  negative: "var(--color-chart-error-negative)",
  missing: "var(--color-chart-missing)",
  zero: "var(--color-chart-zero)",
};

function LegendSwatch({ item }: { item: LegendItem }) {
  if (item.kind === "band") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 rounded-[2px] border border-chart-missing hatch-missing"
      />
    );
  }
  if (item.kind === "area") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3 rounded-[2px]"
        style={{ backgroundColor: legendColor[item.color ?? "actual"], opacity: 0.75 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[2px] w-4 rounded-full"
      style={{
        backgroundImage: item.dashed
          ? `repeating-linear-gradient(90deg, ${legendColor[item.color ?? "actual"]} 0 3px, transparent 3px 6px)`
          : undefined,
        backgroundColor: item.dashed
          ? undefined
          : legendColor[item.color ?? "actual"],
      }}
    />
  );
}

interface ChartPanelProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
  legend?: LegendItem[];
  state?: "ready" | "loading" | "error";
  stateMessage?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

/**
 * Chart surface with a consistent header, frame and legend. Loading and error
 * states keep the same geometry so the layout does not shift.
 */
export function ChartPanel({
  title,
  description,
  actions,
  legend,
  state = "ready",
  stateMessage,
  children,
  className,
  footer,
}: ChartPanelProps) {
  const descriptionId = `chart-desc-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-md border border-border-subtle bg-surface",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
            {title}
          </h2>
          <p
            id={descriptionId}
            className="mt-1 max-w-[76ch] text-caption leading-caption text-text-tertiary"
          >
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>

      <div className="min-w-0 flex-1 px-3 pb-2 sm:px-5">
        {state === "loading" ? (
          <ChartSkeleton />
        ) : state === "error" ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <StateBlock
              kind="error"
              title="Chart unavailable"
              description={stateMessage ?? "Could not load chart data."}
            />
          </div>
        ) : (
          children
        )}
      </div>

      {legend && legend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-subtle px-4 py-2.5 sm:px-5">
          {legend.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[11px] leading-4 text-text-secondary"
            >
              <LegendSwatch item={item} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {footer ? (
        <div className="border-t border-border-subtle px-4 py-2.5 text-[11px] leading-4 text-text-tertiary sm:px-5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function ChartSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[260px] w-full overflow-hidden sm:h-[300px] xl:h-[340px]"
    >
      <div className="absolute inset-y-0 left-9 right-0">
        {[0, 25, 50, 75, 100].map((top) => (
          <div
            key={top}
            className="absolute inset-x-0 border-t border-border-subtle"
            style={{ top: `${top}%` }}
          />
        ))}
      </div>
      <div className="absolute left-9 right-0 top-1/2 flex -translate-y-1/2 justify-center">
        <div className="h-24 w-2/3 animate-pulse rounded-sm bg-surface-subtle" />
      </div>
    </div>
  );
}
