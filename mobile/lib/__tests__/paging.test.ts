import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { api } from "../api";
import { listHotspotsPage, PAGE_SIZE } from "../hotspots";

jest.mock("@react-native-async-storage/async-storage", () => ({}));

/** Answer GET /hotspots with `count` rows, recording the query sent. */
function serve(count: number) {
  const seen: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (cfg) => {
    seen.push(cfg);
    const data = { data: Array.from({ length: count }, (_, i) => ({ id: `h${i}` })) };
    return { data, status: 200, statusText: "", headers: {}, config: cfg };
  };
  api.defaults.adapter = adapter;
  return seen;
}

describe("listHotspotsPage", () => {
  it("asks for one page of the VHT's own submissions", async () => {
    const seen = serve(PAGE_SIZE);
    const page = await listHotspotsPage({ offset: 50, submittedBy: "u1" });
    expect(seen[0].url).toBe("/hotspots");
    expect(seen[0].params).toEqual({ limit: PAGE_SIZE, offset: 50, submitted_by_id: "u1" });
    expect(page.items).toHaveLength(PAGE_SIZE);
    expect(page.hasMore).toBe(true);
  });

  it("filters to active hotspots for stock requests", async () => {
    const seen = serve(3);
    await listHotspotsPage({ offset: 0, status: "active" });
    expect(seen[0].params).toEqual({ limit: PAGE_SIZE, offset: 0, status: "active" });
  });

  it("reports the last page when fewer rows than the page size come back", async () => {
    serve(PAGE_SIZE - 1);
    expect((await listHotspotsPage({ offset: 0 })).hasMore).toBe(false);
  });

  it("stays within the API's limit of 100", () => {
    expect(PAGE_SIZE).toBeLessThanOrEqual(100);
  });
});
