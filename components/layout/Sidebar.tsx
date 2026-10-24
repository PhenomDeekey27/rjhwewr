"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShell } from "@/components/layout/AppShell";
import { NavItem } from "@/components/layout/NavItem";
import {
  IconBook,
  IconClose,
  IconMoon,
  IconOverview,
  IconSun,
  IconTable,
  IconTrend,
  ProductMark,
} from "@/components/ui/icons";

const nav = [
  { href: "/overview", label: "Overview", icon: <IconOverview /> },
  { href: "/forecast-analysis", label: "Forecast Analysis", icon: <IconTrend /> },
  { href: "/data-explorer", label: "Data Explorer", icon: <IconTable /> },
  { href: "/methodology", label: "Methodology", icon: <IconBook /> },
];

function Wordmark({ expanded = true }: { expanded?: boolean }) {
  return (
    <Link
      href="/overview"
      className={[
        "flex items-center rounded-md focus-visible:outline-nav-text-strong",
        expanded ? "gap-2.5" : "justify-center gap-2.5 xl:justify-start",
      ].join(" ")}
      aria-label="Wind Forecast Accuracy — Overview"
    >
      <ProductMark size={28} />
      <span
        className={[
          "min-w-0 leading-[17px]",
          expanded ? "block" : "hidden xl:block",
        ].join(" ")}
      >
        <span className="block truncate text-[13px] font-semibold text-nav-text-strong">
          Wind Forecast
        </span>
        <span className="block truncate text-[13px] font-semibold text-nav-text-strong">
          Accuracy
        </span>
      </span>
    </Link>
  );
}

function ThemeButton({ expanded = true }: { expanded?: boolean }) {
  const { theme, toggleTheme } = useShell();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={[
        "flex h-10 w-full items-center gap-3 rounded-md px-2 text-label font-medium text-nav-text transition-colors hover:bg-nav-bg-raised hover:text-nav-text-strong focus-visible:outline-nav-text-strong",
        expanded ? "" : "justify-center xl:justify-start",
      ].join(" ")}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {isDark ? <IconSun size={17} /> : <IconMoon size={17} />}
      </span>
      <span
        className={[
          "truncate",
          expanded ? "block" : "hidden xl:block",
        ].join(" ")}
      >
        {isDark ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}

function NavList({
  pathname,
  expanded,
  onNavigate,
}: {
  pathname: string;
  expanded?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      {nav.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          current={pathname === item.href}
          showLabel={expanded ? "always" : "rail"}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { mobileNavOpen, closeMobileNav } = useShell();

  return (
    <>
      {/* Desktop / tablet rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col border-r border-nav-border bg-nav-bg text-nav-text md:flex xl:w-[232px]">
        <div className="flex h-14 shrink-0 items-center border-b border-nav-border px-2 xl:px-4">
          <Wordmark expanded={false} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-between px-2 py-3">
          <NavList pathname={pathname} />
          <div className="space-y-2">
            <div className="px-2 pb-1">
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-text/60 xl:block">
                Delivery period
              </p>
              <p className="mt-1 hidden text-[11px] text-nav-text xl:block">
                January 2026
              </p>
            </div>
            <div className="border-t border-nav-border pt-2">
              <ThemeButton expanded={false} />
            </div>
            <p className="hidden px-2 pr-3 text-[10px] leading-4 text-nav-text/70 xl:block">
              <span className="block">v0.1.0</span>
              <span className="block">Elexon WINDFOR / FUELHH</span>
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile off-canvas drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-scrim"
            onClick={closeMobileNav}
            aria-label="Close navigation"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            tabIndex={-1}
            autoFocus
            className="relative flex h-full w-[280px] max-w-[85vw] flex-col border-r border-nav-border bg-nav-bg text-nav-text shadow-lg outline-none"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-nav-border px-4">
              <Wordmark />
              <button
                type="button"
                onClick={closeMobileNav}
                className="rounded-md p-2 text-nav-text transition-colors hover:bg-nav-bg-raised hover:text-nav-text-strong focus-visible:outline-nav-text-strong"
                aria-label="Close navigation"
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-2 py-3">
              <NavList
                pathname={pathname}
                expanded
                onNavigate={closeMobileNav}
              />
              <div className="mt-8 space-y-3">
                <div className="rounded-md border border-nav-border px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-nav-text/60">
                    Delivery period
                  </p>
                  <p className="mt-1 text-[12px] text-nav-text">January 2026</p>
                </div>
                <div className="border-t border-nav-border pt-2">
                  <ThemeButton expanded />
                </div>
                <p className="px-2 pr-3 text-[10px] leading-4 text-nav-text/70">
                  <span className="block">v0.1.0</span>
                  <span className="block">Elexon WINDFOR / FUELHH</span>
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
