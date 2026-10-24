"use client";

import React from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { StatusChip, type StatusVariant } from "@/components/ui/StatusChip";
import { StateBlock } from "@/components/ui/StateBlock";
import { IconArrowRight } from "@/components/ui/icons";

interface DataQualityItem {
  label: string;
  value: string;
  note?: string;
}

interface DataQualityPanelProps {
  items?: DataQualityItem[];
  summary?: { label: string; variant: StatusVariant };
  state?: "loading" | "empty" | "ready";
}

/**
 * Data-quality summary. Only backend-supplied values appear; unknown values
 * stay "— / Not available" rather than implying a successful check.
 */
export function DataQualityPanel({
  items = [],
  summary,
  state = "ready",
}: DataQualityPanelProps) {
  if (state === "loading") {
    return (
      <Panel title="Data quality" subtitle="Waiting for the backend.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded-sm bg-surface-subtle" />
              <div className="h-3.5 w-1/3 animate-pulse rounded-sm bg-surface-subtle" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Data quality"
      subtitle="Checks reported by the backend. Unknown values are shown as unavailable, never assumed."
      action={
        summary ? (
          <StatusChip variant={summary.variant} label={summary.label} />
        ) : undefined
      }
      footer={
        <Link
          href="/methodology#quality"
          className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
        >
          How data quality is handled
          <IconArrowRight size={12} />
        </Link>
      }
      bodyClassName="p-4 sm:p-5"
    >
      {items.length === 0 ? (
        <StateBlock
          kind="empty"
          title="No quality checks run"
          description="Quality details appear after the backend returns January 2026 forecast and actual records."
          compact
        />
      ) : (
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {items.map((item, index) => (
            <div
              key={item.label}
              className={[
                "flex min-w-0 flex-col gap-0.5 py-2.5",
                index < items.length - (items.length % 2 === 0 ? 2 : 1)
                  ? "border-b border-border-subtle"
                  : "",
              ].join(" ")}
            >
              <dt className="text-[11px] leading-4 text-text-tertiary">
                {item.label}
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-table-cell leading-table-cell">
                <span className="tabular-nums text-text-primary">
                  {item.value}
                </span>
                {item.note ? (
                  <span className="text-[11px] text-text-tertiary">
                    {item.note}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

export function emptyQualityItems(): DataQualityItem[] {
  const unavailable = "Not available";
  return [
    { label: "Forecast records retrieved (WINDFOR)", value: "—", note: unavailable },
    { label: "Actual records retrieved (FUELHH)", value: "—", note: unavailable },
    { label: "Expected delivery intervals", value: "—", note: "Computed by backend" },
    { label: "Matched intervals", value: "—", note: "count + %" },
    { label: "Missing matches", value: "—", note: "no forecast / no actual / invalid" },
    { label: "Null or invalid values", value: "—", note: "excluded rows" },
    { label: "Time resolution — WINDFOR", value: "—", note: "Detected from data" },
    { label: "Time resolution — FUELHH", value: "—", note: "Detected from data" },
    { label: "Alignment method", value: "—", note: "Named + affected count" },
    { label: "Publication window fetched", value: "—", note: unavailable },
    { label: "Data freshness", value: "—", note: "Retrieved at" },
    { label: "Validation checks", value: "Not run", note: "No records loaded" },
  ];
}
