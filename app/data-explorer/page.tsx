"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/FilterBar";
import {
  Field,
  SegmentedControl,
  Select,
  Toggle,
} from "@/components/ui/controls";
import {
  DataExplorerTable,
  type DataExplorerRow,
  type MatchStatus,
} from "@/components/dashboard/DataExplorerTable";
import { Button } from "@/components/ui/controls";
import { IconDownload, IconRetry } from "@/components/ui/icons";
import {
  fetchFuelHh,
  fetchWindFor,
  clearCache,
  type Envelope,
  type FuelHhRecord,
  type WindForRecord,
} from "@/lib/api";
import { formatLondonTime } from "@/lib/format";
import { DataQualityPanel, emptyQualityItems } from "@/components/dashboard/DataQualityPanel";
import { StateBlock } from "@/components/ui/StateBlock";

type TimeZone = "Europe/London" | "UTC";
type StatusFilter = "all" | MatchStatus;

type PaginationMeta = {
  page: number;
  perPage: number;
  totalRecords: number;
  totalPages: number;
};

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

export default function DataExplorerPage() {
  const [timeZone, setTimeZone] = useState<TimeZone>("Europe/London");
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [rows, setRows] = useState<DataExplorerRow[]>([]);
  const [windforData, setWindforData] = useState<Envelope<WindForRecord> | null>(null);
  const [fuelhhData, setFuelhhData] = useState<Envelope<FuelHhRecord> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    perPage: 50,
    totalRecords: 0,
    totalPages: 1,
  });

  // Track if a refresh is already in progress to prevent duplicate concurrent refreshes
  const refreshInProgressRef = useRef(false);
  // Abort controller to cancel obsolete requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const buildRows = useCallback(
    (fuelResult: Envelope<FuelHhRecord>, windResult: Envelope<WindForRecord>): DataExplorerRow[] => {
      // Build a map of FUELHH actuals by delivery time (startTime)
      const actualsByDelivery = new Map<string, FuelHhRecord>();
      for (const record of fuelResult.data) {
        actualsByDelivery.set(record.startTime, record);
      }

      // Create rows: one per WINDFOR forecast, matched with actual if available
      const mergedRows: DataExplorerRow[] = [];
      for (const forecast of windResult.data) {
        const actual = actualsByDelivery.get(forecast.startTime);
        mergedRows.push({
          deliveryTime: formatLondonTime(forecast.startTime),
          forecastPublished: forecast.publishTime
            ? formatLondonTime(forecast.publishTime)
            : "—",
          publicationLead: forecast.publishTime
            ? `${Math.round(
                (new Date(forecast.startTime).getTime() -
                  new Date(forecast.publishTime).getTime()) /
                  60000,
              )} min`
            : "—",
          forecastMw: forecast.generation,
          actualMw: actual?.generation ?? null,
          errorMw:
            forecast.generation !== null &&
            actual !== undefined &&
            actual.generation !== null
              ? forecast.generation - actual.generation
              : null,
          matchStatus:
            actual !== undefined ? ("Source data only" as MatchStatus) : ("No actual" as MatchStatus),
          settlement: actual?.settlementDate && actual?.settlementPeriod
            ? `${actual.settlementDate} · P${actual.settlementPeriod}`
            : undefined,
        });
      }

      // Also add FUELHH actuals that have no matching forecast
      for (const actual of fuelResult.data) {
        const hasForecast = windResult.data.some(
          (f) => f.startTime === actual.startTime,
        );
        if (!hasForecast) {
          mergedRows.push({
            deliveryTime: formatLondonTime(actual.startTime),
            forecastPublished: "—",
            publicationLead: "—",
            forecastMw: null,
            actualMw: actual.generation,
            errorMw: null,
            matchStatus: "No eligible forecast" as MatchStatus,
            settlement:
              actual.settlementDate && actual.settlementPeriod
                ? `${actual.settlementDate} · P${actual.settlementPeriod}`
                : undefined,
          });
        }
      }

      // Sort by delivery time
      mergedRows.sort((a, b) =>
        a.deliveryTime.localeCompare(b.deliveryTime),
      );

      return mergedRows;
    },
    [],
  );

  const loadData = useCallback(async (isRefresh = false) => {
    // Prevent duplicate concurrent refreshes
    if (refreshInProgressRef.current) {
      return;
    }
    refreshInProgressRef.current = true;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoadStatus("loading");
    }

    try {
      const [fuelResult, windResult] = await Promise.all([
        fetchFuelHh({
          page: pagination.page,
          perPage: pagination.perPage,
        }),
        fetchWindFor({
          page: pagination.page,
          perPage: pagination.perPage,
        }),
      ]);

      // Check if request was aborted
      if (signal.aborted) {
        return;
      }

      setFuelhhData(fuelResult);
      setWindforData(windResult);

      const mergedRows = buildRows(fuelResult, windResult);
      setRows(mergedRows);
      setLoadStatus("success");
      setErrorMessage(null);

      // Update pagination metadata from response
      if (
        fuelResult.meta &&
        "pagination" in fuelResult.meta &&
        typeof (fuelResult.meta as any).pagination !== "undefined"
      ) {
        setPagination({
          page: pagination.page,
          perPage: pagination.perPage,
          totalRecords:
            (fuelResult.meta as any).pagination.total_records ?? 0,
          totalPages: Math.ceil(
            (fuelResult.meta as any).pagination.total_records ?? 0
              / pagination.perPage,
          ),
        });
      }
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      if (!isRefresh) {
        setRows([]);
        setFuelhhData(null);
        setWindforData(null);
      }
      setLoadStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Backend unavailable",
      );
    } finally {
      if (!signal.aborted) {
        setIsRefreshing(false);
        refreshInProgressRef.current = false;
      }
    }
  }, [buildRows, pagination]);

  const handleRefresh = useCallback(() => {
    clearCache("/api/elexon/windfor");
    clearCache("/api/elexon/fuelhh");
    // Reset to page 1 on refresh
    setPagination({ page: 1, perPage: 50, totalRecords: 0, totalPages: 1 });
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    (async () => {
      await loadData(false);
    })();
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [matchedOnly, setMatchedOnly] = useState(false);

  const filtersActive =
    timeZone !== "Europe/London" || status !== "all" || matchedOnly;
  const statusLabel = status === "all" ? "All statuses" : status;

  return (
    <>
      <TopBar
        title="Data Explorer"
        dataStatus={
          loadStatus === "loading"
            ? { label: "Loading", variant: "neutral" }
            : loadStatus === "error"
              ? { label: "Error", variant: "error" }
              : { label: "Loaded", variant: "favorable" }
        }
      />

      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
              Interval records
            </h2>
            <p className="mt-1 max-w-[72ch] text-caption leading-caption text-text-tertiary">
              Raw January 2026 records: WINDFOR forecasts (multiple per interval) and
              FUELHH actuals. Forecast selection (D‑1 09:00 London cutoff) and
              alignment are not applied — rows show all retrieved records.
              Missing cells show "—", never zero.
            </p>
          </div>
          <Button
            disabled
            title="Export becomes available once interval records are loaded"
            className="min-h-11 md:min-h-9"
          >
            <IconDownload size={14} /> Export CSV
          </Button>
        </div>

        <FilterBar
          summary={
            <>
              <SummaryChip>{timeZone}</SummaryChip>
              <SummaryChip>{statusLabel}</SummaryChip>
              {matchedOnly ? <SummaryChip>Matched only</SummaryChip> : null}
            </>
          }
          onReset={() => {
            setTimeZone("Europe/London");
            setStatus("all");
            setMatchedOnly(false);
            setPagination({ page: 1, perPage: 50, totalRecords: 0, totalPages: 1 });
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
              <IconRetry size={14} className={isRefreshing ? "animate-spin" : ""} />{" "}
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </span>
            </Button>
          }
        >
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <Field label="Time zone" className="w-full sm:w-auto">
              <SegmentedControl
                label="Time zone"
                value={timeZone}
                onChange={setTimeZone}
                options={[
                  { value: "Europe/London", label: "Europe/London" },
                  { value: "UTC", label: "UTC" },
                ]}
              />
            </Field>

            <Field
              label="Match status"
              htmlFor="explorer-status"
              className="w-full sm:w-[190px]"
            >
              <Select
                id="explorer-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as StatusFilter)
                }
              >
                <option value="all">All statuses</option>
                <option value="Matched">Matched</option>
                <option value="No eligible forecast">No eligible forecast</option>
                <option value="No actual">No actual</option>
                <option value="Invalid">Invalid</option>
                <option value="Source data only">Source data only</option>
              </Select>
            </Field>

            <div className="flex min-h-11 items-center sm:min-h-9">
              <Toggle
                label="Matched only"
                checked={matchedOnly}
                onChange={setMatchedOnly}
                description="Hide unmatched and invalid intervals"
              />
            </div>

            <p className="max-w-[42ch] pb-1 text-[11px] leading-4 text-text-tertiary sm:ml-auto">
              Filters narrow the January 2026 interval set. The publication
              cutoff stays fixed and is never changed by this toolbar.
            </p>
          </div>
        </FilterBar>

        {loadStatus === "error" ? (
          <StateBlock
            kind="error"
            title="Backend unavailable"
            description={errorMessage ?? "The backend could not be reached."}
          />
        ) : null}
        <DataQualityPanel
          items={
            loadStatus === "success" && windforData && fuelhhData
              ? [
                  {
                    label: "Forecast records retrieved (WINDFOR)",
                    value: (
                      windforData.meta.recordCounts.WINDFOR ??
                      windforData.quality.accepted ??
                      windforData.data.length ??
                      0
                    ).toLocaleString("en-GB"),
                  },
                  {
                    label: "Actual records retrieved (FUELHH)",
                    value: (
                      fuelhhData.meta.recordCounts.FUELHH ??
                      fuelhhData.quality.accepted ??
                      fuelhhData.data.length ??
                      0
                    ).toLocaleString("en-GB"),
                  },
                  {
                    label: "Null or invalid values",
                    value: (
                      windforData.quality.nullGeneration +
                      fuelhhData.quality.nullGeneration +
                      windforData.quality.rejected +
                      fuelhhData.quality.rejected
                    ).toLocaleString("en-GB"),
                  },
                  {
                    label: "Time resolution — WINDFOR",
                    value: windforData.meta.observedResolutions.WINDFOR
                      ?.delivery.label ?? "Not available",
                  },
                  {
                    label: "Time resolution — FUELHH",
                    value: fuelhhData.meta.observedResolutions.FUELHH
                      ?.delivery.label ?? "Not available",
                  },
                  {
                    label: "Data freshness",
                    value: windforData.meta.retrievedAt ??
                      fuelhhData.meta.retrievedAt ??
                      "Not available",
                  },
                  {
                    label: "Validation checks",
                    value:
                      windforData.quality.checks.every((check) => check.passed) &&
                      fuelhhData.quality.checks.every((check) => check.passed)
                        ? "All passed"
                        : "See details",
                  },
                ]
              : emptyQualityItems()
          }
          summary={
            loadStatus === "loading"
              ? { label: "Loading", variant: "neutral" }
              : loadStatus === "error"
                ? { label: "Error", variant: "error" }
                : { label: "Loaded", variant: "favorable" }
          }
          state={loadStatus === "loading" ? "loading" : "ready"}
        />
        <DataExplorerTable
          rows={rows}
          state={
            loadStatus === "loading"
              ? "loading"
              : loadStatus === "error"
                ? "error"
                : "ready"
          }
          filtersActive={filtersActive}
          onClearFilters={() => {
            setTimeZone("Europe/London");
            setStatus("all");
            setMatchedOnly(false);
            setPagination({ page: 1, perPage: 50, totalRecords: 0, totalPages: 1 });
          }}
          timeZoneLabel={timeZone}
          pagination={pagination}
          onPageChange={(newPage: number) => {
            setPagination({ ...pagination, page: newPage });
          }}
          onPerPageChange={(newPerPage: number) => {
            setPagination({
              ...pagination,
              perPage: newPerPage,
              page: 1,
            });
          }}
        />
      </PageContainer>
    </>
  );
}