"use client";

import React from "react";
import { PLACEHOLDER } from "@/lib/format";
import { MetricInfo } from "@/components/ui/MetricInfo";

interface KpiStatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  context?: string;
  tooltip?: {
    definition: string;
    formula?: string;
    unit?: string;
  };
  align?: "left" | "right";
}

/**
 * KPI anatomy: label + definition → value + unit → context line.
 * Unavailable values stay "—"; zero is never used as a stand-in.
 */
export function KpiStat({
  label,
  value,
  unit,
  context,
  tooltip,
  align = "left",
}: KpiStatProps) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-1.5">
        <span className="text-label font-medium leading-label text-text-secondary">
          {label}
        </span>
        {tooltip ? (
          <MetricInfo
            label={label}
            definition={tooltip.definition}
            formula={tooltip.formula}
            unit={tooltip.unit}
            align={align}
          />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-kpi-value font-semibold leading-kpi-value tracking-[-0.01em] tabular-nums text-text-primary">
          {value}
        </span>
        {unit ? (
          <span className="text-kpi-unit font-medium leading-kpi-unit text-text-secondary">
            {unit}
          </span>
        ) : null}
      </div>
      {context ? (
        <p className="mt-2 text-caption leading-caption text-text-tertiary">
          {context}
        </p>
      ) : null}
    </div>
  );
}

export function KpiStrip({
  children,
  label = "Forecast accuracy metrics",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-md border border-border-subtle bg-border-subtle"
    >
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </div>
  );
}

export function KpiCell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

export function UnavailableKpi({
  label,
  unit,
  context,
  tooltip,
  align,
}: {
  label: string;
  unit?: string;
  context?: string;
  tooltip?: KpiStatProps["tooltip"];
  align?: "left" | "right";
}) {
  return (
    <KpiStat
      label={label}
      value={
        <span className="text-text-tertiary">
          {PLACEHOLDER}
          <span className="sr-only">Not available</span>
        </span>
      }
      unit={unit}
      context={context}
      tooltip={tooltip}
      align={align}
    />
  );
}
