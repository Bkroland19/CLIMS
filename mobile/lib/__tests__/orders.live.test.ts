/**
 * Stockout alerts against a running CLIMS backend, with the app's own client code. Creates a real alert
 * on a development database. Skipped unless CLIMS_LIVE_API is set.
 *
 *   CLIMS_LIVE_API=http://localhost:8080/api/v1 \
 *   CLIMS_LIVE_LOGIN=<vht login> CLIMS_LIVE_PASSWORD=<password> \
 *   CLIMS_LIVE_HM_LOGIN=<hotspot manager login> CLIMS_LIVE_HM_PASSWORD=<password> \
 *   CLIMS_LIVE_PRODUCT_ID=<condom uuid> \
 *   npx jest lib/__tests__/orders.live --watchAll=false
 *
 * Today the API accepts alerts only from a hotspot's assigned manager, so a VHT's attempt is refused and
 * the test checks the message; if the backend accepts it (district rule, or orders:all_stores), the test
 * checks the queued alert instead.
 * CLIMS_LIVE_PRODUCT_ID stands in for the product list the API doesn't offer to these accounts yet.
 */
import { isAxiosError } from "axios";
import { api, login, setTokens, toStoredTokens, tokenClient } from "../api";
import { listHotspotsPage } from "../hotspots";
import {
  listOrders,
  reportStockout,
  stockoutComment,
  stockoutErrorMessage,
  toLocalOrder,
} from "../orders";

const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => mockMemory.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockMemory.set(k, v),
}));

const env = process.env;
const live = env.CLIMS_LIVE_API ? describe : describe.skip;

async function signIn(id?: string, pw?: string) {
  for (const c of [api, tokenClient]) {
    c.defaults.baseURL = env.CLIMS_LIVE_API!.replace(/\/$/, "");
    c.defaults.adapter = "http";
  }
  const res = await login(id ?? "", pw ?? "");
  setTokens(toStoredTokens(res));
  return res.user;
}

live("stockout alerts against a running backend", () => {
  jest.setTimeout(60_000);
  afterAll(() => setTokens(null));

  it("as a VHT: lists active hotspots and handles the send", async () => {
    await signIn(env.CLIMS_LIVE_LOGIN, env.CLIMS_LIVE_PASSWORD);
    const hotspots = (await listHotspotsPage({ offset: 0, status: "active" }))
      .items;
    expect(hotspots.every((h) => h.status === "active")).toBe(true);
    expect(hotspots.length).toBeGreaterThan(0);

    const body = {
      hot_spot_id: hotspots[0].id,
      condom_category: "male" as const,
      message: stockoutComment("Out of stock", "VHT live check"),
    };
    const res = await reportStockout(body).catch((e: unknown) => e);
    if (isAxiosError(res)) {
      // Today's rule: only the hotspot's assigned manager may report, so a VHT is refused.
      expect(res.response?.status).toBe(403);
      expect(stockoutErrorMessage(res)).toMatch(
        /isn't allowed to send stock requests/,
      );
    } else {
      // Accepted once VHTs may report for their district (or the role has orders:all_stores).
      expect(res).toMatchObject({
        hot_spot_id: body.hot_spot_id,
        order_status: "queued",
      });
      expect(
        toLocalOrder(res as never, { hotspot: "h", product: "p" }, "me").source,
      ).toBe("api");
    }
  });

  it("as the hotspot manager: the app's request is accepted and queued for the DCFP", async () => {
    if (!env.CLIMS_LIVE_HM_LOGIN) return;
    const user = await signIn(
      env.CLIMS_LIVE_HM_LOGIN,
      env.CLIMS_LIVE_HM_PASSWORD,
    );
    const body = {
      hot_spot_id: user.hot_spot_id!,
      condom_category: "female" as const,
      message: stockoutComment("Running low", "Hotspot manager live check"),
    };
    const res = await reportStockout(body);
    expect(res).toMatchObject({
      hot_spot_id: body.hot_spot_id,
      order_status: "queued",
      comment: "Running low. Hotspot manager live check",
    });
    expect(toLocalOrder(res, { hotspot: "h", product: "p" }, "me").status).toBe(
      "queued",
    );
    // The manager's Orders tab lists it from GET /orders.
    const orders = await listOrders();
    expect(orders.map((o) => o.id)).toContain(res.id);
  });
});
