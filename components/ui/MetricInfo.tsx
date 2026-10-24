"use client";

import { useId, useState } from "react";
import { IconInfo } from "@/components/ui/icons";

interface MetricInfoProps {
  label: string;
  definition: string;
  formula?: string;
  unit?: string;
  align?: "left" | "right";
}

/**
 * Accessible metric definition popover. Opens on hover, focus and tap; closes
 * on Escape, blur or pointer leave.
 */
export function MetricInfo({
  label,
  definition,
  formula,
  unit,
  align = "left",
}: MetricInfoProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Definition of ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <IconInfo size={13} />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={[
            "absolute top-full z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border-default bg-surface p-3 text-left text-caption font-normal leading-caption text-text-secondary shadow-md",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <span className="block text-label font-semibold text-text-primary">
            {label}
          </span>
          <span className="mt-1 block">{definition}</span>
          {formula ? (
            <span className="mt-1.5 block font-mono-ui text-[11px] text-text-secondary">
              {formula}
            </span>
          ) : null}
          {unit ? (
            <span className="mt-1 block text-[11px] text-text-tertiary">
              Unit: {unit}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
