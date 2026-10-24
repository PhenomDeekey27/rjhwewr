"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { IconMinus, IconWarning } from "@/components/ui/icons";

type StateKind = "loading" | "empty" | "error" | "partial" | "invalid";

interface StateBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  kind: StateKind;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

const kindConfig: Record<
  StateKind,
  {
    label: string;
    icon: React.ReactNode;
    tone: string;
  }
> = {
  loading: {
    label: "Loading",
    icon: <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />,
    tone: "text-accent-600",
  },
  empty: {
    label: "No data",
    icon: <IconMinus size={16} />,
    tone: "text-text-tertiary",
  },
  error: {
    label: "Error",
    icon: <IconWarning size={16} />,
    tone: "text-status-error",
  },
  partial: {
    label: "Partial data",
    icon: <IconWarning size={16} />,
    tone: "text-status-warning",
  },
  invalid: {
    label: "Invalid data",
    icon: <IconWarning size={16} />,
    tone: "text-status-error",
  },
};

/**
 * Unified empty / loading / error / partial presentation. Each panel owns its
 * own state; a failure is never rendered as success.
 */
export function StateBlock({
  kind,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: StateBlockProps) {
  const config = kindConfig[kind];
  return (
    <div
      role={kind === "loading" ? "status" : undefined}
      aria-live={kind === "loading" ? "polite" : undefined}
      className={cn(
        "flex flex-col items-center justify-center rounded-sm px-4 text-center",
        compact ? "py-6" : "py-10",
        className,
      )}
      {...props}
    >
      <span className={cn("mb-2.5 inline-flex", config.tone)} aria-hidden="true">
        {config.icon}
      </span>
      <p className="text-label font-semibold leading-label text-text-primary">
        {kind === "loading" ? title : `${config.label} — ${title}`}
      </p>
      {description ? (
        <p className="mt-1 max-w-[46ch] text-caption leading-caption text-text-tertiary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
