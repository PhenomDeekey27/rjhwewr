"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/FilterBar";
import {
  Button,
  Field,
  SegmentedControl,
  Select,
  Toggle,
} from "@/components/ui/controls";
import {
  DataExplorerTable,
  type DataExplorerRow,
  type MatchStatus,
  type SortKey,
} from "@/components/dashboard/DataExplorerTable";
import { IconDownload, IconRetry } from "@/components/ui/icons";
import {
  fetchExplorerRecords,
  clearCache,
  type Envelope,
  type ExplorerRecord,
} from "@/lib/api";
import {
  PLACEHOLDER,
  formatCount,
  formatLeadMinutes,
  formatZonedTime,
} from "@/lib/format";
import {
  DataQualityPanel,
  emptyQualityItems,
} from "@/components/dashboard/DataQualityPanel";
import { StateBlock } from "@/components/ui/StateBlock";

type TimeZone = "Europe/London" | "UTC";
type StatusFilter = "all" | MatchStatus;

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-sm border border-border-default bg-surface px-3 text-[11px] font-medium text-text-primary hover:bg-surface-subtle"
    >
      Retry
    </button>
  );
}

function toDisplayRow(
  record: ExplorerRecord,
  timeZone: TimeZone,
): DataExplorerRow {
  return {
    deliveryTime: formatZonedTime(record.deliveryTime, timeZone),
    forecastPublished: record.forecastPublished
      ? formatZonedTime(record.forecastPublished, timeZone)
      : PLACEHOLDER,
    publicationLead: formatLeadMinutes(record.publicationLeadMinutes),
    forecastMw: record.forecastGeneration,
    actualMw: record.actualGeneration,
    errorMw: record.error,
    matchStatus: record.matchStatus as MatchStatus,
    settlement:
      record.settlementDate && record.settlementPeriod
        ? `${record.settlementDate} · P${record.settlementPeriod}`
        : undefined,
  };
}

export default function DataExplorerPage() {
  const [timeZone, setTimeZone] = useState<TimeZone>("Europe/London");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [matchedOnly, setMatchedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);
  const [sortKey, setSortKey] = useState<SortKey>("deliveryTime");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [envelope, setEnvelope] = useState<Envelope<ExplorerRecord> | null>(
    null,
  );

  // Loading is derived from which query the latest success/error belongs to.
  // That keeps the effect free of synchronous setState calls (which cause an
  // extra render pass on every page/filter change).
  const request = useMemo(
    () => ({
      page,
      perPage,
      sort: sortKey,
      direction: sortDirection,
      status: status === "all" ? undefined : status,
      matchedOnly: matchedOnly ? true : undefined,
    }),
    [page, perPage, sortKey, sortDirection, status, matchedOnly],
  );
  const queryKey = JSON.stringify(request);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refreshPendingRef = useRef(false);

  const loadState: "loading" | "success" | "error" =
    errorKey === queryKey
      ? "error"
      : loadedKey === queryKey
        ? "success"
        : "loading";
  const busy = isRefreshing || loadState === "loading";

  useEffect(() => {
    const refresh = refreshPendingRef.current;
    refreshPendingRef.current = false;
    const controller = new AbortController();
    let cancelled = false;
    const requestKey = queryKey;

    (async () => {
      try {
        const response = await fetchExplorerRecords(request, {
          refresh,
          signal: controller.signal,
        });
        if (cancelled) return;

        const recordPage = response.meta.recordPage;
        const maxPage = Math.max(1, recordPage?.totalPages ?? 1);
        if (recordPage && request.page > maxPage) {
          // A filter or refresh shrank the result set; return to a real page
          // instead of showing an empty page with stale numbering.
          setPage(maxPage);
          return;
        }

        setEnvelope(response);
        setLoadedKey(requestKey);
        setErrorKey(null);
        setErrorMessage(null);
        setLastSuccessAt(
          response.meta.retrievedAt ?? new Date().toISOString(),
        );
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.name === "AbortError") return;
        // Keep the last successful page visible; the banner and the status chip
        // mark it as errored/stale rather than pretending it is loaded.
        setErrorKey(requestKey);
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
  }, [request, queryKey, refreshNonce]);

  const rows = useMemo(() => {
    if (!envelope) return [];
    return envelope.data.map((record) => toDisplayRow(record, timeZone));
  }, [envelope, timeZone]);

  const recordPage = envelope?.meta.recordPage ?? null;
  const pagination = {
    page: recordPage?.page ?? page,
    perPage: recordPage?.perPage ?? perPage,
    totalRecords: recordPage?.totalRecords ?? 0,
    totalPages: Math.max(1, recordPage?.totalPages ?? 1),
  };

  const filtersActive =
    timeZone !== "Europe/London" || status !== "all" || matchedOnly;

  const handleRefresh = () => {
    clearCache("/api/elexon/explorer");
    refreshPendingRef.current = true;
    setIsRefreshing(true);
    setErrorKey(null);
    setErrorMessage(null);
    if (page !== 1) {
      setPage(1);
    } else {
      setRefreshNonce((value) => value + 1);
    }
  };

  const resetFilters = () => {
    setTimeZone("Europe/London");
    setStatus("all");
    setMatchedOnly(false);
    setPage(1);
  };

  const checksPassed =
    envelope !== null &&
    envelope.quality.checks.length > 0 &&
    envelope.quality.checks.every((check) => check.passed);

  const dataStatus =
    busy
      ? {
          label: isRefreshing ? "Refreshing" : "Loading",
          variant: "neutral" as const,
        }
      : loadState === "error"
        ? { label: "Error", variant: "error" as const }
        : checksPassed
          ? {
              label: lastSuccessAt
                ? `Loaded · ${formatZonedTime(lastSuccessAt, timeZone)}`
                : "Loaded",
              variant: "favorable" as const,
            }
          : { label: "Partial data", variant: "warning" as const };

  const windforLabel =
    envelope?.meta.observedResolutions.WINDFOR?.delivery.label ??
    "Not available";
  const fuelhhLabel =
    envelope?.meta.observedResolutions.FUELHH?.delivery.label ??
    "Not available";
  const prepared = envelope?.meta.prepared ?? null;

  const qualityItems =
    envelope !== null
      ? [
          {
            label: "Forecast records retrieved (WINDFOR)",
            value: formatCount(
              envelope.meta.recordCounts.WINDFOR ?? envelope.quality.accepted,
            ),
          },
          {
            label: "Actual records retrieved (FUELHH)",
            value: formatCount(
              envelope.meta.recordCounts.FUELHH ?? envelope.quality.accepted,
            ),
          },
          {
            label: "Interval rows (filtered)",
            value: formatCount(recordPage?.totalRecords ?? rows.length),
            note: recordPage
              ? `page ${recordPage.page} of ${Math.max(1, recordPage.totalPages)} · ${formatCount(recordPage.returned)} on this page`
              : undefined,
          },
          {
            label: "Null or invalid values",
            value: formatCount(
              envelope.quality.nullGeneration + envelope.quality.rejected,
            ),
            note: `${formatCount(envelope.quality.duplicatesRemoved)} duplicate(s) removed`,
          },
          {
            label: "Time resolution — WINDFOR",
            value: windforLabel,
            note: "Detected from data",
          },
          {
            label: "Time resolution — FUELHH",
            value: fuelhhLabel,
            note: "Detected from data",
          },
          {
            label: "Data freshness",
            value: formatZonedTime(envelope.meta.retrievedAt, timeZone),
          },
          {
            label: "Prepared cache",
            value: prepared
              ? prepared.cached
                ? `Cached · ${formatCount(prepared.ageSeconds ?? 0)}s old`
                : "Rebuilt from Elexon"
              : "Not available",
            note: prepared?.ttlSeconds
              ? `TTL ${formatCount(prepared.ttlSeconds)}s`
              : undefined,
          },
          {
            label: "Validation checks",
            value: checksPassed ? "All passed" : "See details",
            note: `${envelope.quality.checks.filter((check) => check.passed).length}/${envelope.quality.checks.length} passed`,
          },
        ]
      : emptyQualityItems();

  return (
    <>
      <TopBar title="Data Explorer" dataStatus={dataStatus} />

      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
              Interval records
            </h2>
            <p className="mt-1 max-w-[72ch] text-caption leading-caption text-text-tertiary">
              Raw January 2026 records: WINDFOR forecasts (multiple publication
              versions per interval) and FUELHH actuals. Day-ahead forecast
              selection and alignment are not applied here — rows show all
              retrieved records. Pages are computed by the backend, so only the
              visible page is transferred. Missing cells show “{PLACEHOLDER}”,
              never zero.
            </p>
          </div>
          <Button
            disabled
            title="CSV export is not available while records are paginated on the server"
            className="min-h-11 md:min-h-9"
          >
            <IconDownload size={14} /> Export CSV
          </Button>
        </div>

        <FilterBar
          summary={
            <>
              <SummaryChip>{timeZone}</SummaryChip>
              <SummaryChip>
                {status === "all" ? "All statuses" : status}
              </SummaryChip>
              {matchedOnly ? (
                <SummaryChip>Both values only</SummaryChip>
              ) : null}
            </>
          }
          onReset={resetFilters}
          resetDisabled={!filtersActive}
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              title="Rebuild the data from Elexon and bypass the prepared cache"
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
                onChange={(event) => {
                  setStatus(event.target.value as StatusFilter);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                <option value="Source data only">Source data only</option>
                <option value="No eligible forecast">
                  No eligible forecast
                </option>
                <option value="No actual">No actual</option>
                <option value="Invalid">Invalid</option>
              </Select>
            </Field>

            <div className="flex min-h-11 items-center sm:min-h-9">
              <Toggle
                label="Both values only"
                checked={matchedOnly}
                onChange={(checked) => {
                  setMatchedOnly(checked);
                  setPage(1);
                }}
                description="Hide rows without a forecast or actual value"
              />
            </div>

            <p className="max-w-[42ch] pb-1 text-[11px] leading-4 text-text-tertiary sm:ml-auto">
              Filters narrow the January 2026 interval set on the server. The
              publication cutoff stays fixed and is never changed by this
              toolbar.
            </p>
          </div>
        </FilterBar>

        {!busy && loadState === "error" ? (
          <StateBlock
            kind="error"
            title="Backend unavailable"
            description={
              envelope
                ? `${errorMessage ?? "The last refresh failed."} Showing the last successfully loaded page from ${formatZonedTime(lastSuccessAt, timeZone)}; it is not marked as loaded.`
                : (errorMessage ?? "The backend could not be reached.")
            }
            action={<RetryButton onClick={handleRefresh} />}
          />
        ) : null}

        <DataQualityPanel
          items={qualityItems}
          summary={dataStatus}
          state={busy && !envelope ? "loading" : "ready"}
        />

        <DataExplorerTable
          rows={rows}
          state={
            busy
              ? "loading"
              : loadState === "error" && envelope === null
                ? "error"
                : "ready"
          }
          filtersActive={filtersActive}
          onClearFilters={resetFilters}
          timeZoneLabel={timeZone}
          pagination={pagination}
          onPageChange={setPage}
          onPerPageChange={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
          }}
          sort={sortKey}
          direction={sortDirection}
          onSortChange={(key, direction) => {
            setSortKey(key);
            setSortDirection(direction);
            setPage(1);
          }}
        />
      </PageContainer>
    </>
  );
}
