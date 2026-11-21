import { AxiosError, type AxiosAdapter } from "axios";
import { api } from "../api";
import {
  listProducts,
  ProductsUnavailable,
  productsProblemMessage,
  stockoutComment,
  stockoutErrorMessage,
  toLocalOrder,
  type ApiOrder,
} from "../orders";

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => mockStore.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockStore.set(k, v),
}));

/** Answer GET requests by path; anything else is a 404. */
function serve(routes: Record<string, { status: number; data?: unknown } | "offline">) {
  const adapter: AxiosAdapter = async (cfg) => {
    const r = routes[cfg.url ?? ""] ?? { status: 404 };
    if (r === "offline") throw new AxiosError("Network Error", "ERR_NETWORK", cfg);
    const res = { data: r.data, status: r.status, statusText: "", headers: {}, config: cfg };
    if (r.status >= 400) throw new AxiosError("fail", String(r.status), cfg, null, res as never);
    return res;
  };
  api.defaults.adapter = adapter;
}

beforeEach(() => mockStore.clear());

describe("listProducts", () => {
  it("uses the catalogue, labelled, without inactive products", async () => {
    serve({
      "/catalogue/products": {
        status: 200,
        data: {
          data: [
            {
              id: "m",
              category: "male",
              type: "free",
              brand: { id: "b", name: "Engabu" },
              active: true,
            },
            { id: "f", category: "female", type: "commercial", brand: null, active: true },
            {
              id: "old",
              category: "male",
              type: "free",
              brand: { id: "b", name: "Lifeguard" },
              active: false,
            },
          ],
        },
      },
    });
    expect(await listProducts()).toEqual([
      { id: "m", name: "Engabu male · Free" },
      { id: "f", name: "female · Commercial" },
    ]);
  });

  it("builds a deduplicated, sorted list from inventory rows and caches it", async () => {
    serve({
      "/inventory/stock": {
        status: 200,
        data: {
          data: [
            { condom_id: "m", product: "Male · Orange" },
            { condom_id: "f", product: "Female · Orange" },
            { condom_id: "m", product: "Male · Orange" },
          ],
        },
      },
    });
    expect(await listProducts()).toEqual([
      { id: "f", name: "Female · Orange" },
      { id: "m", name: "Male · Orange" },
    ]);
    // Offline later: the cached list is used.
    serve({ "/inventory/stock": "offline", "/inventory/hotspots": "offline" });
    expect((await listProducts()).map((p) => p.id)).toEqual(["f", "m"]);
  });

  it("falls back to hotspot inventory when stock balances are empty", async () => {
    serve({
      "/inventory/stock": { status: 200, data: { data: [] } },
      "/inventory/hotspots": { status: 200, data: { data: [{ condom_id: "m", product: "Male" }] } },
    });
    expect(await listProducts()).toEqual([{ id: "m", name: "Male" }]);
  });

  it("says why when the account can't see products and nothing is cached", async () => {
    serve({ "/inventory/stock": { status: 403 }, "/inventory/hotspots": { status: 403 } });
    const err = await listProducts().catch((e) => e);
    expect(err).toBeInstanceOf(ProductsUnavailable);
    expect(err.problem).toBe("forbidden");
    expect(productsProblemMessage(err.problem)).toMatch(/can't see the product list/);
  });
});

describe("stockoutErrorMessage", () => {
  const err = (status?: number) =>
    new AxiosError("x", "x", undefined, null, status ? ({ status } as never) : undefined);
  it("explains a refusal so the VHT knows it isn't their mistake", () => {
    expect(stockoutErrorMessage(err(403))).toMatch(/isn't allowed to send stock requests/);
  });
  it("explains a hotspot without a district", () => {
    expect(stockoutErrorMessage(err(422))).toMatch(/isn't linked to a district/);
  });
  it("promises to send later when offline", () => {
    expect(stockoutErrorMessage(err())).toMatch(/back online/);
  });
});

describe("toLocalOrder", () => {
  const base: ApiOrder = {
    id: "o1",
    hot_spot_id: "h1",
    condom_id: "m",
    order_status: "queued",
    comment: "Out of stock",
    created_at: "2026-11-21T09:00:00Z",
  };
  it("keeps the API id, names and comment", () => {
    expect(toLocalOrder(base, { hotspot: "Kazo Lodge", product: "Male" }, "Grace")).toMatchObject({
      id: "o1",
      source: "api",
      hotspotId: "h1",
      hotspot: "Kazo Lodge",
      product: "Male",
      status: "queued",
      note: "Out of stock",
      by: "Grace",
      byRole: "VHT",
    });
  });
  it("maps the API's workflow statuses onto the app's", () => {
    const st = (order_status: ApiOrder["order_status"]) =>
      toLocalOrder({ ...base, order_status }, { hotspot: "", product: "" }, "").status;
    expect(st("on_hold")).toBe("on_hold");
    expect(st("reviewed")).toBe("review");
    expect(st("dispatched")).toBe("dispatched");
    expect(st("delivered")).toBe("delivered");
  });
});

describe("stockoutComment", () => {
  it("leads with what's happening", () => {
    expect(stockoutComment("Running low", "  Busy weekend ")).toBe("Running low. Busy weekend");
    expect(stockoutComment("Out of stock", "")).toBe("Out of stock");
  });
});
