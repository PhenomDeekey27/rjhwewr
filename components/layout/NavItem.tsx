"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface NavItemProps {
  href: string;
  label: string;
  icon: ReactNode;
  current: boolean;
  /** drawer labels always show; rail labels appear at xl and above. */
  showLabel?: "always" | "rail";
  onNavigate?: () => void;
}

export function NavItem({
  href,
  label,
  icon,
  current,
  showLabel = "rail",
  onNavigate,
}: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={[
        "group relative flex h-10 items-center gap-3 rounded-md pr-3 text-label font-medium leading-label transition-colors duration-150",
        showLabel === "always" ? "pl-3" : "justify-center xl:justify-start xl:pl-3",
        current
          ? "bg-nav-bg-raised text-nav-text-strong"
          : "text-nav-text hover:bg-nav-bg-raised/70 hover:text-nav-text-strong",
        "focus-visible:outline-nav-text-strong",
      ].join(" ")}
    >
      {current ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500"
        />
      ) : null}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-current">
        {icon}
      </span>
      <span
        className={[
          "truncate",
          showLabel === "always" ? "block" : "hidden xl:block",
        ].join(" ")}
      >
        {label}
      </span>
    </Link>
  );
}
