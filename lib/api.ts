/**
 * Browser-side client for the FastAPI backend.
 *
 * The backend base URL comes from NEXT_PUBLIC_API_BASE_URL so production builds
 * do not hard-code localhost. Empty responses are never turned into fake data.
 *
 * Caching is keyed by the full request (path + query), so a page change never
 * returns another page's records. ``refresh`` bypasses both the read and the
 * write of the browser cache and asks the backend to rebuild its prepared data.
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

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

type FetchOptions = {
  /** Bypass the browser cache and ask the backend to refresh its prepared data. */
  refresh?: boolean;
  signal?: AbortSignal;
};

// Simple in-memory cache for GET requests with TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function buildQuery(query?: QueryParams, refresh?: boolean): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  if (refresh) params.set("refresh", "true");
  const serialised = params.toString();
  return serialised ? `?${serialised}` : "";
}

function cacheKey(path: string, search: string): string {
  return `${path}${search}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function clearCache(path?: string): void {
  if (!path) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key === path || key.startsWith(`${path}?`)) {
      cache.delete(key);
    }
  }
}

export async function fetchJson<T>(
  path: string,
  query?: QueryParams,
  options: FetchOptions = {},
): Promise<T> {
  const search = buildQuery(query, options.refresh);
  const key = cacheKey(path, search);

  if (!options.refresh) {
    const cached = getCached<T>(key);
    if (cached) return cached;
  } else {
    cache.delete(key);
  }

  const response = await fetch(`${API_BASE_URL}${path}${search}`, {
    headers: { Accept: "application/json" },
    signal: options.signal,
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
  cache.set(key, { data: body, timestamp: Date.now() });
  return body as T;
}

// --------------------------------------------------------------------------- //
// Raw datasets
// --------------------------------------------------------------------------- //

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

export interface RecordPage {
  page: number;
  perPage: number;
  totalRecords: number;
  totalPages: number;
  returned: number;
  sort: string | null;
  direction: string | null;
  filters: Record<string, string>;
}

export interface PreparedInfo {
  cached: boolean;
  preparedAt: string | null;
  ageSeconds: number | null;
  ttlSeconds: number | null;
}

export interface SelectionMeta {
  rule: string;
  cutoffLocalTime: string;
  cutoffTimezone: string;
  status: string;
  policy: string;
  selectedRecords: number;
  unmatchedIntervals: number;
}

export interface AlignmentMeta {
  method: string;
  description: string;
  forecastResolutionMinutes: number | null;
  actualResolutionMinutes: number | null;
  actualsPerForecastInterval: number | null;
  affectedIntervals: number;
  interpolation: string;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Meta {
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
  recordPage?: RecordPage | null;
  prepared?: PreparedInfo | null;
  selection?: SelectionMeta | null;
  alignment?: AlignmentMeta | null;
  unit?: string | null;
  publicationWindow?: { start: string | null; endExclusive: string | null } | null;
  error?: { type: string; message: string } | null;
}

export interface Quality {
  rowsFetched: number;
  accepted: number;
  rejected: number;
  rejectedReasons: Record<string, number>;
  duplicatesRemoved: number;
  nullGeneration: number;
  nullPublishTime: number;
  checks: QualityCheck[];
  notes: string[];
}

export interface Envelope<T> {
  data: T[];
  meta: Meta;
  quality: Quality;
}

export function fetchJanuary2026Summary() {
  return fetchJson<Envelope<DatasetSummary>>("/api/elexon/january-2026");
}

export function fetchFuelHh(options?: FetchOptions) {
  return fetchJson<Envelope<FuelHhRecord>>(
    "/api/elexon/fuelhh",
    undefined,
    options,
  );
}

export function fetchWindFor(options?: FetchOptions) {
  return fetchJson<Envelope<WindForRecord>>(
    "/api/elexon/windfor",
    undefined,
    options,
  );
}

// --------------------------------------------------------------------------- //
// Data Explorer (server-paginated raw records)
// --------------------------------------------------------------------------- //

export interface ExplorerRecord {
  deliveryTime: string;
  forecastPublished: string | null;
  publicationLeadMinutes: number | null;
  forecastGeneration: number | null;
  actualGeneration: number | null;
  error: number | null;
  matchStatus: string;
  settlementDate: string | null;
  settlementPeriod: number | null;
}

export interface ExplorerQuery extends QueryParams {
  page?: number;
  perPage?: number;
  sort?:
    | "deliveryTime"
    | "forecastPublished"
    | "publicationLead"
    | "forecastMw"
    | "actualMw"
    | "errorMw"
    | "matchStatus";
  direction?: "asc" | "desc";
  status?: string;
  matchedOnly?: boolean;
}

export function fetchExplorerRecords(
  query: ExplorerQuery,
  options?: FetchOptions,
) {
  return fetchJson<Envelope<ExplorerRecord>>(
    "/api/elexon/explorer",
    query,
    options,
  );
}

// --------------------------------------------------------------------------- //
// Forecast accuracy (selection + alignment + metrics, computed server-side)
// --------------------------------------------------------------------------- //

export interface AccuracySummary {
  unit: string;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  matchedIntervals: number;
  expectedIntervals: number;
  coveragePercent: number | null;
  matchedActualHalfHours: number;
  expectedActualHalfHours: number;
}

export interface DailyAccuracy {
  deliveryDate: string;
  expectedIntervals: number;
  matchedIntervals: number;
  coveragePercent: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  missingByReason: Record<string, number>;
}

export interface IntervalAccuracy {
  deliveryTime: string;
  deliveryDate: string;
  forecastPublished: string | null;
  forecastGeneration: number | null;
  actualGeneration: number | null;
  error: number | null;
  status: string;
  actualObservations: number;
}

export interface MissingInterval {
  deliveryTime: string;
  deliveryDate: string;
  reason: string;
}

export interface AccuracyPayload {
  summary: AccuracySummary;
  daily: DailyAccuracy[];
  intervals: IntervalAccuracy[];
  missing: {
    byReason: Record<string, number>;
    intervals: MissingInterval[];
  };
}

export interface AccuracyEnvelope {
  data: AccuracyPayload;
  meta: Meta;
  quality: Quality;
}

export function fetchForecastAccuracy(options?: FetchOptions) {
  return fetchJson<AccuracyEnvelope>(
    "/api/elexon/forecast-accuracy",
    undefined,
    options,
  );
}
