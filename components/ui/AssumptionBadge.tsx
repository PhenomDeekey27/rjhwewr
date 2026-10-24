"use client";

import React from "react";
import Link from "next/link";
import { IconInfo } from "@/components/ui/icons";

interface AssumptionBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  href?: string;
}

/**
 * Marks a displayed rule or value that depends on an unconfirmed decision.
 * Always links to the assumptions register entry.
 */
export function AssumptionBadge({
  children,
  href = "/methodology#forecast-selection-rule",
  className,
  ...props
}: AssumptionBadgeProps) {
  const label = children ?? "Assumption";
  return (
    <Link
      href={href}
      className={[
        "inline-flex h-[20px] items-center gap-1 rounded-sm border border-status-info/40 bg-status-info-surface px-1.5 text-[10px] font-semibold leading-none text-text-primary transition-colors hover:bg-status-info-surface/70",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <IconInfo size={11} className="text-status-info" />
      <span className="sr-only">Assumption: </span>
      {label}
    </Link>
  );
}
