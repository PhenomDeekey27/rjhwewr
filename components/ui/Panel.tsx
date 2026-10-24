"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Bordered surface with an optional header and footer. No nested panels and
 * no shadow in dense data areas.
 */
export function Panel({
  title,
  subtitle,
  action,
  footer,
  bodyClassName,
  children,
  className,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-md border border-border-subtle bg-surface",
        className,
      )}
      {...props}
    >
      {title || subtitle || action ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-1 text-caption leading-caption text-text-tertiary">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-w-0 p-4 sm:p-5", bodyClassName)}>{children}</div>
      {footer ? (
        <footer className="border-t border-border-subtle px-4 py-2.5 text-caption leading-caption text-text-tertiary sm:px-5">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
