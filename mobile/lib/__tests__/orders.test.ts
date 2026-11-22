import { AxiosError, type AxiosAdapter } from "axios";
import { api } from "../api";
import {
  currentStockoutRequest,
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
    const res = {
      data: r.data,
      status: r.status,
      statusText: "",
      headers: {},
      config: cfg,
    };
    if (r.status >= 400) throw new AxiosError("fail", String(r.status), cfg, null, res as never);
    return res;
  };
  api.defaults.adapter = adapter;
}

beforeEach(() => mockStore.clear());

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

describe("currentStockoutRequest", () => {
  it("keeps a request that already names a category", () => {
    const request = {
      hot_spot_id: "h1",
      condom_category: "male" as const,
      message: null,
    };
    expect(currentStockoutRequest(request, "Male condoms")).toBe(request);
  });
  it("converts one saved with a product, reading the category from its name", () => {
    const saved = {
      hot_spot_id: "h1",
      condom_id: "p1",
      comment: "Out of stock",
    };
    expect(currentStockoutRequest(saved, "Engabu female · Free")).toEqual({
      hot_spot_id: "h1",
      condom_category: "female",
      message: "Out of stock",
    });
    expect(currentStockoutRequest(saved, "Engabu male · Free").condom_category).toBe("male");
    expect(currentStockoutRequest(saved, "Trust · Commercial").condom_category).toBe("both");
  });
});
