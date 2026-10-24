"use client";

import React from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------- Field --- */

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium leading-4 text-text-secondary"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <span className="text-[11px] leading-4 text-text-tertiary">{hint}</span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Button --- */

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-accent-600 bg-accent-600 text-on-accent hover:bg-accent-500 hover:border-accent-500",
  secondary:
    "border-border-default bg-surface text-text-primary hover:bg-surface-subtle",
  ghost:
    "border-transparent bg-transparent text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-label md:h-9",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ Date input --- */

export function DateInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="date"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-border-default bg-surface px-2.5 text-table-cell tabular-nums text-text-primary transition-colors hover:border-border-strong md:h-9",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Select --- */

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-sm border border-border-default bg-surface py-0 pl-2.5 pr-8 text-table-cell text-text-primary transition-colors hover:border-border-strong md:h-9",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary"
      >
        <path
          d="m5 7.5 5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------- Segmented ---- */

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-full rounded-sm border border-border-default bg-surface-sunken p-0.5 sm:w-auto"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 flex-1 whitespace-nowrap rounded-[3px] px-3 text-[11px] font-medium transition-colors sm:h-8",
              active
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Toggle --- */

export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2.5 rounded-sm text-left md:min-h-9"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked
            ? "border-accent-600 bg-accent-600"
            : "border-border-default bg-surface-sunken",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-surface shadow-sm transition-transform",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-[11px] font-medium leading-4 text-text-primary">
          {label}
        </span>
        {description ? (
          <span className="text-[11px] leading-4 text-text-tertiary">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
