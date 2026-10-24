"use client";

import { useState } from "react";
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
import { IconDownload } from "@/components/ui/icons";

type TimeZone = "Europe/London" | "UTC";
type StatusFilter = "all" | MatchStatus;

function SummaryChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[10px] font-medium leading-none text-text-secondary">
      {children}
    </span>
  );
}

export default function DataExplorerPage() {
  const rows: DataExplorerRow[] = [];
  const [timeZone, setTimeZone] = useState<TimeZone>("Europe/London");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [matchedOnly, setMatchedOnly] = useState(false);

  const filtersActive =
    timeZone !== "Europe/London" || status !== "all" || matchedOnly;
  const statusLabel = status === "all" ? "All statuses" : status;

  return (
    <>
      <TopBar
        title="Data Explorer"
        dataStatus={{ label: "No data loaded", variant: "neutral" }}
      />

      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
              Interval records
            </h2>
            <p className="mt-1 max-w-[72ch] text-caption leading-caption text-text-tertiary">
              One row per January 2026 delivery interval, traced to its selected
              forecast and actual source rows. Missing cells show “—”, never
              zero.
            </p>
          </div>
          <Button
            disabled
            title="Export becomes available once interval records are loaded"
            className="min-h-11 md:min-h-9"
          >
            <IconDownload size={14} />
            Export CSV
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
          }}
          resetDisabled={!filtersActive}
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

        <DataExplorerTable
          rows={rows}
          state="ready"
          filtersActive={filtersActive}
          onClearFilters={() => {
            setTimeZone("Europe/London");
            setStatus("all");
            setMatchedOnly(false);
          }}
          timeZoneLabel={timeZone}
        />
      </PageContainer>
    </>
  );
}
