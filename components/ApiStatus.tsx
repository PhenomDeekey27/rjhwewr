"use client";

import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconRetry, IconWarning } from "@/components/ui/icons";

type Status = "loading" | "success" | "error";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const chipStyles: Record<Status, string> = {
  loading:
    "border-status-neutral bg-status-neutral-surface text-text-secondary",
  success:
    "border-status-favorable bg-status-favorable-surface text-text-primary",
  error: "border-status-error bg-status-error-surface text-text-primary",
};

/**
 * Compact backend health indicator (checks /api/health). Failure stays visible
 * but does not take over the page: one chip plus a retry action.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Checking backend…");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("loading");
    setMessage("Checking backend…");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        await response.json();
        if (!cancelled) {
          setStatus("success");
          setMessage("Backend connected");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            error instanceof Error && error.name === "AbortError"
              ? "Backend request timed out"
              : error instanceof Error
                ? error.message
                : "Backend unavailable",
          );
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    checkHealth();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  const label =
    status === "success"
      ? "API connected"
      : status === "error"
        ? "API unavailable"
        : "API…";

  const title =
    status === "success"
      ? `${message} · ${API_BASE_URL}/api/health`
      : status === "error"
        ? `${message} · ${API_BASE_URL}/api/health`
        : `Checking ${API_BASE_URL}/api/health`;

  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={[
        "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[11px] font-medium leading-none",
        chipStyles[status],
      ].join(" ")}
    >
      {status === "loading" ? (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full border-[1.5px] border-current border-t-transparent motion-safe:animate-spin"
        />
      ) : status === "success" ? (
        <IconCheck size={13} />
      ) : (
        <IconWarning size={13} />
      )}
      <span className="hidden sm:inline">{label}</span>
      <span aria-hidden="true" className="sm:hidden">
        API
      </span>
      <span className="sr-only sm:hidden">{label}</span>
      {status === "error" ? (
        <button
          type="button"
          onClick={retry}
          aria-label="Retry backend health check"
          title="Retry"
          className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface/60 hover:text-text-primary focus-visible:outline-offset-1"
        >
          <IconRetry size={12} />
        </button>
      ) : null}
    </span>
  );
}
