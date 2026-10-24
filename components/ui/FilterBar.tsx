"use client";

import { useId, useState } from "react";
import { FisherIcon } from "./filter-icon";

export function FilterBar({
  children,
  summary,
  onReset,
  resetDisabled = false,
  label = "Filters",
  actions,
}: {
  children: React.ReactNode;
  summary?: React.ReactNode;
  onReset?: () => void;
  resetDisabled?: boolean;
  label?: string;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section
      aria-label={label}
      className="rounded-md border border-border-subtle bg-surface"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
        <span className="flex items-center gap-2 text-text-secondary">
          <FisherIcon />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
            {label}
          </span>
        </span>

        {summary ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:hidden">
            {summary}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {actions}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              disabled={resetDisabled}
              className="h-9 rounded-sm px-2 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary disabled:pointer-events-none disabled:opacity-45 md:h-8"
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-default bg-surface px-2.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-subtle lg:hidden"
          >
            {open ? "Hide" : "Show"}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path
                d="m5 7.5 5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        id={panelId}
        className={[
          "border-border-subtle px-3 pb-3 sm:px-4 sm:pb-4",
          open ? "block border-t pt-3 sm:pt-4" : "hidden lg:block lg:border-t lg:pt-3",
        ].join(" ")}
      >
        {children}
      </div>
    </section>
  );
}
