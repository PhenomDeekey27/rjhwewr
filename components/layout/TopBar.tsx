"use client";

import { useShell } from "@/components/layout/AppShell";
import { ApiStatus } from "@/components/ApiStatus";
import { StatusChip, type StatusVariant } from "@/components/ui/StatusChip";
import { AssumptionBadge } from "@/components/ui/AssumptionBadge";
import { IconMenu } from "@/components/ui/icons";
import { cutoffRuleLabel, PUBLICATION_WINDOW_NOTE } from "@/lib/config";

interface TopBarProps {
  title: string;
  dataStatus?: { label: string; variant: StatusVariant };
  showCutoff?: boolean;
}

/**
 * Sticky product header: page title, fixed January 2026 delivery period,
 * cutoff assumption, data status and compact backend health. Page filters live
 * in the page toolbar so this row stays readable at every width.
 */
export function TopBar({
  title,
  dataStatus,
  showCutoff = true,
}: TopBarProps) {
  const { openMobileNav } = useShell();

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 lg:px-6">
        <button
          type="button"
          onClick={openMobileNav}
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary md:hidden"
        >
          <IconMenu size={19} />
        </button>

        <h1 className="min-w-[7rem] flex-1 truncate text-page-title font-semibold leading-page-title tracking-[-0.01em] text-text-primary">
          {title}
        </h1>

        <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:justify-end lg:gap-2">
          <span
            title={`Delivery-time scope. ${PUBLICATION_WINDOW_NOTE}`}
            aria-label="Analysis period: January 2026, delivery-time scope"
            className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-border-subtle bg-surface-subtle px-2 text-[11px] font-medium leading-none text-text-secondary"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent-600" aria-hidden="true" />
            <span className="hidden sm:inline">January 2026</span>
            <span className="sm:hidden">Jan 2026</span>
          </span>

          {showCutoff ? (
            <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-sm border border-border-subtle bg-surface px-2 text-[11px] leading-none text-text-secondary">
              <span className="hidden sm:inline">Cutoff</span>
              <span className="font-medium text-text-primary">
                {cutoffRuleLabel()}
              </span>
              <AssumptionBadge />
            </span>
          ) : null}

          {dataStatus ? (
            <StatusChip
              variant={dataStatus.variant}
              label={dataStatus.label}
              size="md"
              live
            />
          ) : null}

          <ApiStatus />
        </div>
      </div>
    </header>
  );
}
