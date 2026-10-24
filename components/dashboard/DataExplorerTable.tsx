"use client";

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { PLACEHOLDER, formatMw, formatSignedMw } from "@/lib/format";
import { StatusChip, type StatusVariant } from "@/components/ui/StatusChip";
import { StateBlock } from "@/components/ui/StateBlock";

export type MatchStatus =
  | "Matched"
  | "No eligible forecast"
  | "No actual"
  | "Invalid";

export interface DataExplorerRow {
  deliveryTime: string;
  forecastPublished: string;
  publicationLead: string;
  forecastMw: number | null;
  actualMw: number | null;
  errorMw: number | null;
  matchStatus: MatchStatus;
  settlement?: string;
}

type SortKey =
  | "deliveryTime"
  | "forecastPublished"
  | "publicationLead"
  | "forecastMw"
  | "actualMw"
  | "errorMw"
  | "matchStatus";

interface Column {
  key: SortKey;
  label: string;
  unit?: string;
  numeric?: boolean;
  width: number;
}

const columns: Column[] = [
  { key: "deliveryTime", label: "Delivery time", unit: "startTime", width: 190 },
  {
    key: "forecastPublished",
    label: "Forecast published",
    unit: "publishTime",
    width: 180,
  },
  { key: "publicationLead", label: "Publication lead", width: 135 },
  { key: "forecastMw", label: "Forecast", unit: "MW", numeric: true, width: 110 },
  { key: "actualMw", label: "Actual", unit: "MW", numeric: true, width: 110 },
  {
    key: "errorMw",
    label: "Error (F − A)",
    unit: "MW",
    numeric: true,
    width: 140,
  },
  { key: "matchStatus", label: "Match status", width: 165 },
];

const matchChip: Record<MatchStatus, { variant: StatusVariant; label: string }> = {
  Matched: { variant: "favorable", label: "Matched" },
  "No eligible forecast": { variant: "warning", label: "No eligible forecast" },
  "No actual": { variant: "warning", label: "No actual" },
  Invalid: { variant: "error", label: "Invalid" },
};

function compare(
  left: DataExplorerRow,
  right: DataExplorerRow,
  key: SortKey,
  direction: "asc" | "desc",
): number {
  const a = left[key];
  const b = right[key];
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "en-GB");
  return direction === "asc" ? result : -result;
}

function SignedError({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-text-tertiary">{PLACEHOLDER}</span>;
  }
  const { sign, abs } = formatSignedMw(value);
  return (
    <span className="inline-flex items-center justify-end gap-1 tabular-nums">
      <span
        aria-hidden="true"
        className={cn(
          "text-[10px]",
          value > 0
            ? "text-status-error"
            : value < 0
              ? "text-status-warning"
              : "text-status-neutral",
        )}
      >
        {value > 0 ? "▲" : value < 0 ? "▼" : "•"}
      </span>
      <span className="text-text-primary">
        {sign}
        {abs}
      </span>
    </span>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, row) => (
        <tr key={row} className="border-b border-border-subtle last:border-0">
          {columns.map((column) => (
            <td key={column.key} className="px-3 py-3">
              <div className="h-3.5 w-4/5 animate-pulse rounded-sm bg-surface-subtle" />
            </td>
          ))}
          <td className="px-3 py-3">
            <div className="h-3.5 w-10 animate-pulse rounded-sm bg-surface-subtle" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function DataExplorerTable({
  rows = [],
  state = "ready",
  onRowClick,
  onClearFilters,
  filtersActive = false,
  timeZoneLabel = "Europe/London",
}: {
  rows?: DataExplorerRow[];
  state?: "loading" | "empty" | "error" | "ready";
  onRowClick?: (row: DataExplorerRow) => void;
  onClearFilters?: () => void;
  filtersActive?: boolean;
  timeZoneLabel?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("deliveryTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => compare(a, b, sortKey, sortDirection)),
    [rows, sortKey, sortDirection],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const emptyTitle = filtersActive
    ? "No records match these filters"
    : "No interval records loaded";
  const emptyDescription = filtersActive
    ? "Clear or widen the filters to see all available intervals."
    : "January 2026 delivery intervals will appear here once the backend returns forecast and actual records.";

  const detailWidth = onRowClick ? 90 : 0;
  const totalWidth =
    columns.reduce((sum, column) => sum + column.width, 0) + detailWidth;
  const isEmpty = state !== "loading" && sortedRows.length === 0;

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border-subtle bg-surface">
      {isEmpty ? (
        <div className="px-3">
          <StateBlock
            kind={state === "error" ? "error" : "empty"}
            title={state === "error" ? "Records unavailable" : emptyTitle}
            description={
              state === "error"
                ? "The interval records could not be loaded. The backend status above shows the failure."
                : emptyDescription
            }
            action={
              filtersActive && onClearFilters ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="h-9 rounded-sm border border-border-default bg-surface px-3 text-[11px] font-medium text-text-primary hover:bg-surface-subtle"
                >
                  Clear filters
                </button>
              ) : undefined
            }
            className="py-10 md:py-12"
          />
        </div>
      ) : null}

      {/* Desktop table */}
      {!isEmpty ? (
        <div className="hidden max-h-[calc(100dvh-19rem)] min-h-[220px] overflow-auto md:block">
        <table
          className="w-full table-fixed border-collapse text-left"
          style={{ minWidth: totalWidth }}
        >
          <caption className="sr-only">
            January 2026 delivery intervals with eligible day-ahead forecast,
            actual generation, signed error and match status. Sorted by{" "}
            {columns.find((column) => column.key === sortKey)?.label},{" "}
            {sortDirection}ending.
          </caption>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
            {onRowClick ? <col style={{ width: 90 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const active = sortKey === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "sticky top-0 z-20 h-11 border-b border-border-default bg-surface-subtle px-3 text-table-header font-semibold leading-table-header text-text-secondary",
                      column.numeric ? "text-right" : "text-left",
                      index === 0 && "left-0 z-30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        "inline-flex w-full items-center gap-1.5 text-inherit",
                        column.numeric ? "justify-end" : "justify-start",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{column.label}</span>
                        {column.unit ? (
                          <span className="font-normal normal-case text-text-tertiary">
                            {column.unit}
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "text-[9px] transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      >
                        {active && sortDirection === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
              {onRowClick ? (
                <th
                  scope="col"
                  className="sticky right-0 top-0 z-30 h-11 border-b border-l border-border-subtle bg-surface-subtle px-3 text-right text-table-header font-semibold text-text-secondary"
                >
                  Detail
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {state === "loading" ? (
              <LoadingRows />
            ) : (
              sortedRows.map((row, index) => (
                <tr
                  key={`${row.deliveryTime}-${index}`}
                  onClick={() => onRowClick?.(row)}
                  className="group h-11 border-b border-border-subtle last:border-0 hover:bg-surface-subtle"
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 font-mono-ui text-[12px] leading-4 text-text-primary group-hover:bg-surface-subtle">
                    <span className="block whitespace-nowrap">
                      {row.deliveryTime}
                    </span>
                  </td>
                  <td className="px-3 font-mono-ui text-[12px] leading-4 text-text-secondary">
                    <span className="block whitespace-nowrap">
                      {row.forecastPublished}
                    </span>
                  </td>
                  <td className="px-3 font-mono-ui text-[12px] text-text-secondary">
                    <span className="block whitespace-nowrap">
                      {row.publicationLead}
                    </span>
                  </td>
                  <td className="px-3 text-right text-table-cell tabular-nums text-text-primary">
                    {formatMw(row.forecastMw)}
                  </td>
                  <td className="px-3 text-right text-table-cell tabular-nums text-text-primary">
                    {formatMw(row.actualMw)}
                  </td>
                  <td className="px-3 text-right text-table-cell">
                    <SignedError value={row.errorMw} />
                  </td>
                  <td className="px-3">
                    <StatusChip
                      variant={matchChip[row.matchStatus].variant}
                      label={matchChip[row.matchStatus].label}
                    />
                  </td>
                  {onRowClick ? (
                    <td className="border-l border-border-subtle px-3 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick(row);
                        }}
                        className="text-[11px] font-medium text-accent-600 hover:underline"
                        aria-label={`View detail for ${row.deliveryTime}`}
                      >
                        Detail
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
      ) : null}

      {/* Mobile stacked records */}
      <div className={cn("md:hidden", isEmpty && "hidden")}>
        {state === "loading" ? (
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2 p-4" aria-hidden="true">
                <div className="h-4 w-2/3 animate-pulse rounded-sm bg-surface-subtle" />
                <div className="h-3.5 w-1/2 animate-pulse rounded-sm bg-surface-subtle" />
                <div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-surface-subtle" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {sortedRows.map((row, index) => (
              <li key={`${row.deliveryTime}-${index}`} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono-ui text-[12px] leading-4 text-text-primary">
                      {row.deliveryTime}
                    </p>
                    <p className="mt-0.5 font-mono-ui text-[10px] leading-4 text-text-tertiary">
                      Published {row.forecastPublished}
                    </p>
                  </div>
                  <StatusChip
                    variant={matchChip[row.matchStatus].variant}
                    label={matchChip[row.matchStatus].label}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                      Forecast
                    </dt>
                    <dd className="mt-0.5 text-table-cell tabular-nums text-text-primary">
                      {formatMw(row.forecastMw)}{" "}
                      <span className="text-[10px] text-text-tertiary">MW</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                      Actual
                    </dt>
                    <dd className="mt-0.5 text-table-cell tabular-nums text-text-primary">
                      {formatMw(row.actualMw)}{" "}
                      <span className="text-[10px] text-text-tertiary">MW</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                      Error (F − A)
                    </dt>
                    <dd className="mt-0.5 text-table-cell">
                      <SignedError value={row.errorMw} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                      Publication lead
                    </dt>
                    <dd className="mt-0.5 font-mono-ui text-[11px] text-text-secondary">
                      {row.publicationLead}
                    </dd>
                  </div>
                </dl>
                {onRowClick ? (
                  <button
                    type="button"
                    onClick={() => onRowClick(row)}
                    className="mt-3 inline-flex h-9 items-center text-[11px] font-medium text-accent-600 hover:underline"
                  >
                    View record detail
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 py-2.5 text-[11px] leading-4 text-text-tertiary sm:px-4">
        <span>
          {state === "loading"
            ? "Loading interval records…"
            : `${sortedRows.length.toLocaleString("en-GB")} interval ${
                sortedRows.length === 1 ? "record" : "records"
              }`}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Delivery time in {timeZoneLabel}</span>
          <span aria-hidden="true">·</span>
          <span>“—” means unavailable, never zero</span>
        </span>
      </div>
    </div>
  );
}
