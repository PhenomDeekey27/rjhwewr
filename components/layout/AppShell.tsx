"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

interface ShellContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const THEME_KEY = "wind-theme";
const THEME_EVENT = "wind-theme-change";

/**
 * The inline script in the root layout applies the stored theme before paint.
 * React reads that attribute as an external store rather than copying it into
 * state, so the toggle always reflects what the document is actually showing.
 */
function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

/**
 * App shell: fixed navigation, mobile drawer and theme ownership.
 * Light is the default; dark is an explicit, persisted choice.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  // A drawer belongs to the route it was opened on; navigating (including via
  // history) closes it without an effect that writes state after render.
  const [mobileNav, setMobileNav] = useState({
    open: false,
    path: pathname,
  });
  const mobileNavOpen = mobileNav.open && mobileNav.path === pathname;

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable in private modes; the theme still applies.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const openMobileNav = useCallback(
    () => setMobileNav({ open: true, path: pathname }),
    [pathname],
  );
  const closeMobileNav = useCallback(
    () => setMobileNav((current) => ({ ...current, open: false })),
    [],
  );

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileNav();
    };
    // If the viewport grows past the drawer breakpoint, drop the overlay and
    // release the scroll lock rather than leaving the page stuck.
    const desktop = window.matchMedia("(min-width: 768px)");
    const onBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobileNav();
    };
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, [closeMobileNav, mobileNavOpen]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
    }),
    [theme, setTheme, toggleTheme, mobileNavOpen, openMobileNav, closeMobileNav],
  );

  return (
    <ShellContext.Provider value={value}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:border focus:border-border-strong focus:bg-surface focus:px-4 focus:py-2.5 focus:text-label focus:font-semibold focus:text-text-primary focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="min-h-dvh md:pl-16 xl:pl-[232px]">{children}</div>
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within an AppShell provider");
  }
  return ctx;
}
