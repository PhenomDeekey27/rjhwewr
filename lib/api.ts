/**
 * Browser-side client for the FastAPI backend.
 *
 * The backend base URL comes from NEXT_PUBLIC_API_BASE_URL so production builds
 * do not hard-code localhost. Empty responses are never turned into fake data.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Simple in-memory cache for GET requests with TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(path: string): T | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(path);
    return null;
  }
  return entry.data as T;
}

function setCache(path: string, data: unknown): void {
  cache.set(path, { data, timestamp: Date.now() });
}

export function clearCache(path?: string): void {
  if (path) {
    cache.delete(path);
  } else {
    cache.clear();
  }
}

export async function fetchJson<T>(path: string, query?: FuelHhQuery | WindForQuery): Promise<T> {
  // Check cache first
  const cached = getCached<T>(path);
  if (cached) return cached;

  // Build query string from query params
  let searchParams = "";
  if (query) {
    searchParams = "?" + Object.entries(query)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)))
      .join("&");
  }

  const response = await fetch(`${API_BASE_URL}${path}${searchParams}`, {
    headers: { Accept: "application/json" },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(
      `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      body,
    );
  }
  setCache(path, body);
  return body as T;
}

export interface WindForRecord {
  dataset: string | null;
  publishTime: string;
  startTime: string;
  generation: number | null;
}

export interface FuelHhRecord {
  dataset: string | null;
  publishTime: string | null;
  startTime: string;
  settlementDate: string | null;
  settlementPeriod: number | null;
  fuelType: string | null;
  generation: number | null;
}

export interface ObservedResolution {
  minutes: number | null;
  label: string | null;
  distinctTimestamps: number;
  unavailableReason: string | null;
}

export interface DatasetResolutions {
  delivery: ObservedResolution;
  publish: ObservedResolution;
}

export interface DatasetSummary {
  dataset: string;
  endpointPath: string;
  recordCount: number;
  rowsFetched: number;
  rejected: number;
  nullGeneration: number;
  observedResolution: DatasetResolutions;
}

export interface Envelope<T> {
  data: T[];
  meta: {
    datasets: string[];
    retrievedAt: string | null;
    observedResolutions: Record<string, DatasetResolutions>;
    observedCoverage: Record<
      string,
      {
        firstDeliveryTime: string | null;
        lastDeliveryTime: string | null;
        firstPublishTime: string | null;
        lastPublishTime: string | null;
      }
    >;
    recordCounts: Record<string, number>;
    publicationWindow?: { start: string | null; endExclusive: string | null } | null;
    error?: { type: string; message: string } | null;
  };
  quality: {
    rowsFetched: number;
    accepted: number;
    rejected: number;
    rejectedReasons: Record<string, number>;
    nullGeneration: number;
    checks: { name: string; passed: boolean; detail: string }[];
  };
}

export function fetchJanuary2026Summary() {
  return fetchJson<Envelope<DatasetSummary>>("/api/elexon/january-2026");
}

export interface FuelHhQuery {
  page?: number;
  perPage?: number;
}

export interface WindForQuery {
  page?: number;
  perPage?: number;
}

export function fetchFuelHh(query?: FuelHhQuery) {
  return fetchJson<Envelope<FuelHhRecord>>("/api/elexon/fuelhh", query);
}

export function fetchWindFor(query?: WindForQuery) {
  return fetchJson<Envelope<WindForRecord>>("/api/elexon/windfor", query);
}