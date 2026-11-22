import { AxiosError, type AxiosAdapter } from "axios";
import { api } from "../api";
import {
  acknowledgeErrorMessage,
  acknowledgeStockout,
  getStockout,
  listStockouts,
  savedStockout,
  unacknowledged,
  reportStockout,
  stockoutComment,
  stockoutErrorMessage,
  stockoutProduct,
  toLocalOrder,
  type StockoutDetail,
  type StockoutReport,
} from "../orders";

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => mockStore.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockStore.set(k, v),
}));

const report: StockoutReport = {
  id: "r1",
  hot_spot_id: "h1",
  hot_spot: { name: "Kazo Lodge", district: "Kazo" },
  condom_id: null,
  product: "female condoms",
  selection: "female",
  reported_by: "Grace Atim",
  comment: "Out of stock",
  repeat_count: 0,
  status: "awaiting_supply",
  fulfilled_at: null,
  created_at: "2026-11-21T09:00:00Z",
  last_reported_at: "2026-11-21T09:00:00Z",
};

/** Answer requests by method and path; anything else is a 404. Records what was sent. */
function serve(routes: Record<string, { status: number; data?: unknown }>) {
  const sent: { method?: string; url?: string; data?: unknown; params?: unknown }[] = [];
  const adapter: AxiosAdapter = async (cfg) => {
    sent.push({
      method: cfg.method,
      url: cfg.url,
      data: cfg.data && JSON.parse(cfg.data),
      params: cfg.params,
    });
    const r = routes[`${cfg.method?.toUpperCase()} ${cfg.url}`] ?? { status: 404 };
    const res = { data: r.data, status: r.status, statusText: "", headers: {}, config: cfg };
    if (r.status >= 400) throw new AxiosError("fail", String(r.status), cfg, null, res as never);
    return res;
  };
  api.defaults.adapter = adapter;
  return sent;
}

describe("reportStockout", () => {
  it("sends the selection and reports a new notification", async () => {
    const sent = serve({ "POST /orders/stockouts": { status: 201, data: { data: report } } });
    const body = { hot_spot_id: "h1", selection: "female" as const, comment: "Out of stock" };
    await expect(reportStockout(body)).resolves.toEqual({ report, repeated: false });
    expect(sent[0].data).toEqual(body);
  });
  it("says when the message was counted against the hotspot's open notification", async () => {
    const both = { ...report, selection: "both" as const, repeat_count: 1 };
    serve({ "POST /orders/stockouts": { status: 200, data: { data: both } } });
    const res = await reportStockout({ hot_spot_id: "h1", selection: "male", comment: null });
    expect(res).toEqual({ report: both, repeated: true });
  });
});

describe("listStockouts", () => {
  it("lists from GET /orders/stockouts", async () => {
    const sent = serve({ "GET /orders/stockouts": { status: 200, data: { data: [report] } } });
    await expect(listStockouts()).resolves.toEqual([report]);
    expect(sent[0].params).toEqual({ limit: 100, offset: 0 });
  });
});

const line = (id: string, acknowledged_pieces: number | null) => ({
  id,
  category: "female" as const,
  product: "Engabu Free Female",
  quantity: 2,
  pieces: 200,
  acknowledged_pieces,
  acknowledged_at: acknowledged_pieces == null ? null : "2026-11-22T10:00:00Z",
});
const detail: StockoutDetail = {
  ...report,
  status: "awaiting_acknowledgement",
  deliveries: [
    { id: "d1", note: null, created_at: "2026-11-22T08:00:00Z", lines: [line("l1", 200)] },
    { id: "d2", note: "Second box", created_at: "2026-11-22T09:00:00Z", lines: [line("l2", null)] },
  ],
  events: [],
};

describe("stockout details and acknowledgements", () => {
  beforeEach(() => mockStore.clear());
  it("loads a notification and keeps a copy for offline use", async () => {
    serve({ "GET /orders/stockouts/r1": { status: 200, data: { data: detail } } });
    await expect(getStockout("r1")).resolves.toEqual(detail);
    await new Promise((r) => setTimeout(r, 0));
    await expect(savedStockout("r1")).resolves.toEqual(detail);
  });
  it("sends the counted pieces per line", async () => {
    const done = { ...detail, status: "fulfilled" as const };
    const sent = serve({
      "POST /orders/stockouts/r1/acknowledgements": { status: 200, data: { data: done } },
    });
    const body = { lines: [{ line_id: "l2", pieces: 180 }] };
    await expect(acknowledgeStockout("r1", body)).resolves.toEqual(done);
    expect(sent[0].data).toEqual(body);
  });
  it("lists only the lines still waiting for a count", () => {
    expect(unacknowledged(detail).map((l) => l.id)).toEqual(["l2"]);
  });
  it("explains refusals", () => {
    const err = (status?: number) =>
      new AxiosError("x", "x", undefined, null, status ? ({ status } as never) : undefined);
    expect(acknowledgeErrorMessage(err(409))).toMatch(/different count/);
    expect(acknowledgeErrorMessage(err(403))).toMatch(/Only the hotspot's manager/);
    expect(acknowledgeErrorMessage(err())).toMatch(/back online/);
  });
});

describe("stockoutErrorMessage", () => {
  const err = (status?: number, message?: string) =>
    new AxiosError(
      "x",
      "x",
      undefined,
      null,
      status ? ({ status, data: { message } } as never) : undefined,
    );
  it("explains a refusal so the VHT knows it isn't their mistake", () => {
    expect(stockoutErrorMessage(err(403))).toMatch(/isn't allowed to send stock requests/);
  });
  it("explains a hotspot without a district", () => {
    expect(stockoutErrorMessage(err(422))).toMatch(/isn't linked to a district/);
  });
  it("asks for a type when an old by-product request has no category", () => {
    expect(
      stockoutErrorMessage(
        err(422, "this product has no Male or Female category; send selection instead"),
      ),
    ).toMatch(/Choose Male, Female or Both/);
  });
  it("points at the form for other refused details", () => {
    expect(stockoutErrorMessage(err(422, "selection must be male, female or both"))).toMatch(
      /Check the form/,
    );
  });
  it("promises to send later when offline", () => {
    expect(stockoutErrorMessage(err())).toMatch(/back online/);
  });
});

describe("toLocalOrder", () => {
  it("keeps the API id, hotspot, reporter and comment, and names the selection", () => {
    expect(toLocalOrder(report, "Me", "Hotspot manager")).toMatchObject({
      id: "r1",
      source: "api",
      hotspotId: "h1",
      hotspot: "Kazo Lodge",
      product: "Female condoms",
      status: "queued",
      note: "Out of stock",
      by: "Grace Atim",
      byRole: "Hotspot manager",
    });
  });
  it("maps fulfilment statuses onto the app's", () => {
    const st = (status: StockoutReport["status"]) => toLocalOrder({ ...report, status }, "").status;
    expect(st("awaiting_supply")).toBe("queued");
    expect(st("awaiting_acknowledgement")).toBe("delivered");
    expect(st("partly_received")).toBe("delivered");
    expect(st("fulfilled")).toBe("received");
  });
});

describe("stockoutProduct", () => {
  it("names the product of an older by-product notification, else the selection", () => {
    expect(stockoutProduct({ ...report, condom_id: "c1", product: "Engabu Free Female" })).toBe(
      "Engabu Free Female",
    );
    expect(stockoutProduct({ ...report, selection: "both" })).toBe("Male and female condoms");
  });
});

describe("stockoutComment", () => {
  it("leads with what's happening", () => {
    expect(stockoutComment("Running low", "  Busy weekend ")).toBe("Running low. Busy weekend");
    expect(stockoutComment("Out of stock", "")).toBe("Out of stock");
  });
});
