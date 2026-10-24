"use client";

import React from "react";
import {
  IconCheck,
  IconInfo,
  IconMinus,
  IconWarning,
} from "@/components/ui/icons";

export type StatusVariant =
  | "favorable"
  | "warning"
  | "error"
  | "neutral"
  | "info";

interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: StatusVariant;
  label: string;
  size?: "sm" | "md";
  /** Use only for dynamic state that should be announced. */
  live?: boolean;
}

const variantStyles: Record<StatusVariant, string> = {
  favorable:
    "border-status-favorable/40 bg-status-favorable-surface [&_.chip-icon]:text-status-favorable",
  warning:
    "border-status-warning/40 bg-status-warning-surface [&_.chip-icon]:text-status-warning",
  error:
    "border-status-error/40 bg-status-error-surface [&_.chip-icon]:text-status-error",
  neutral:
    "border-border-default bg-status-neutral-surface [&_.chip-icon]:text-status-neutral",
  info: "border-status-info/40 bg-status-info-surface [&_.chip-icon]:text-status-info",
};

const sizeStyles: Record<"sm" | "md", string> = {
  sm: "h-[22px] px-2 text-[11px]",
  md: "h-6 px-2.5 text-[11px]",
};

function VariantIcon({ variant }: { variant: StatusVariant }) {
  const className = "chip-icon";
  switch (variant) {
    case "favorable":
      return <IconCheck size={13} className={className} />;
    case "warning":
    case "error":
      return <IconWarning size={13} className={className} />;
    case "info":
      return <IconInfo size={13} className={className} />;
    default:
      return <IconMinus size={13} className={className} />;
  }
}

/**
 * Status chip: icon + text, never colour alone. Status colour is carried by the
 * icon and border; the label uses primary text for AA contrast on the tint.
 */
export function StatusChip({
  variant,
  label,
  size = "sm",
  live = false,
  className,
  ...props
}: StatusChipProps) {
  return (
    <span
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border font-semibold leading-none text-text-primary",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <VariantIcon variant={variant} />
      <span className="truncate">{label}</span>
    </span>
  );
}
