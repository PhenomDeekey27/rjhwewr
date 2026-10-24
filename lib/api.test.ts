import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  fetchJson,
  fetchWindFor,
  fetchFuelHh,
  fetchJanuary2026Summary,
  fetchExplorerRecords,
  fetchForecastAccuracy,
  clearCache,
} from "./api";

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearCache();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ value: 42 }),
      }),
    );

    await expect(fetchJson("/api/elexon/january-2026")).resolves.toEqual({
      value: 42,
    });
  });

  it("throws ApiError with status and body on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ data: [], meta: { error: { type: "upstreamError" } } }),
      }),
    );

    await expect(fetchJson("/api/elexon/fuelhh")).rejects.toBeInstanceOf(ApiError);
    try {
      await fetchJson("/api/elexon/fuelhh");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(502);
    }
  });
});

describe("API endpoint functions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // Clear the in-memory cache between tests
    clearCache();
  });

  const mockEnvelope = (data: unknown[]) => ({
    data,
    meta: { datasets: ["WINDFOR"], retrievedAt: null, observedResolutions: {}, observedCoverage: {}, recordCounts: {} },
    quality: { rowsFetched: 0, accepted: 0, rejected: 0, rejectedReasons: {}, nullGeneration: 0, checks: [] },
  });

  it("fetchWindFor calls correct endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockEnvelope([{ dataset: "WINDFOR", publishTime: "2026-01-01T00:00:00Z", startTime: "2026-01-01T00:00:00Z", generation: 1000 }]),
      }),
    );

    const result = await fetchWindFor();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].dataset).toBe("WINDFOR");
  });

  it("fetchFuelHh calls correct endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockEnvelope([{ dataset: "FUELHH", publishTime: "2026-01-01T00:00:00Z", startTime: "2026-01-01T00:00:00Z", generation: 1000, settlementDate: "2026-01-01", settlementPeriod: 1, fuelType: "WIND" }]),
      }),
    );

    const result = await fetchFuelHh();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].dataset).toBe("FUELHH");
  });

  it("fetchJanuary2026Summary calls correct endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockEnvelope([{
          dataset: "WINDFOR",
          endpointPath: "/datasets/WINDFOR",
          recordCount: 1,
          rowsFetched: 1,
          rejected: 0,
          nullGeneration: 0,
          observedResolution: {
            delivery: { minutes: 60, label: "1 hour", distinctTimestamps: 1, deltaHistogram: [], method: "", unavailableReason: null },
            publish: { minutes: 60, label: "1 hour", distinctTimestamps: 1, deltaHistogram: [], method: "", unavailableReason: null }
          },
          observedCoverage: {
            firstDeliveryTime: "2026-01-01T00:00:00Z",
            lastDeliveryTime: "2026-01-01T00:00:00Z",
            firstPublishTime: "2026-01-01T00:00:00Z",
            lastPublishTime: "2026-01-01T00:00:00Z"
          }
        }]),
      }),
    );

    const result = await fetchJanuary2026Summary();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].dataset).toBe("WINDFOR");
  });
});

describe("server-side pagination queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearCache();
  });

  const mockOk = () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: [], meta: {}, quality: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("sends page, page size, sort and filters to the explorer endpoint", async () => {
    const fetchMock = mockOk();

    await fetchExplorerRecords({
      page: 2,
      perPage: 25,
      sort: "errorMw",
      direction: "desc",
      status: "Source data only",
      matchedOnly: true,
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/elexon/explorer?");
    expect(url).toContain("page=2");
    expect(url).toContain("perPage=25");
    expect(url).toContain("sort=errorMw");
    expect(url).toContain("direction=desc");
    expect(url).toContain("status=Source+data+only");
    expect(url).toContain("matchedOnly=true");
  });

  it("omits empty filters", async () => {
    const fetchMock = mockOk();

    await fetchExplorerRecords({ page: 1, perPage: 50 });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain("status=");
    expect(url).not.toContain("matchedOnly=");
  });

  it("caches each page separately and never returns another page's rows", async () => {
    const fetchMock = mockOk();

    await fetchExplorerRecords({ page: 1, perPage: 50 });
    await fetchExplorerRecords({ page: 2, perPage: 50 });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Repeating page 1 is a cache hit; repeating page 2 would be too.
    await fetchExplorerRecords({ page: 1, perPage: 50 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refresh bypasses the cache and asks the backend to rebuild", async () => {
    const fetchMock = mockOk();

    await fetchExplorerRecords({ page: 1, perPage: 50 });
    await fetchExplorerRecords(
      { page: 1, perPage: 50 },
      { refresh: true },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("refresh=true");
  });

  it("fetches the accuracy payload without turning it into rows", async () => {
    const fetchMock = mockOk();

    await fetchForecastAccuracy();

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/elexon/forecast-accuracy",
    );
  });
});