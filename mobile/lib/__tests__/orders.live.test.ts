/**
 * Stockout alerts against a running CLIMS backend, with the app's own client code. Creates a real alert
 * on a development database. Skipped unless CLIMS_LIVE_API is set.
 *
 *   CLIMS_LIVE_API=http://localhost:8080/api/v1 \
 *   CLIMS_LIVE_LOGIN=<vht login> CLIMS_LIVE_PASSWORD=<password> \
 *   CLIMS_LIVE_HM_LOGIN=<hotspot manager login> CLIMS_LIVE_HM_PASSWORD=<password> \
 *   npx jest lib/__tests__/orders.live --watchAll=false
 *
 * The API accepts alerts from the assigned manager and from a VHT with orders:stockout and
 * orders:stockout_district for an active hotspot in their district. The VHT test checks the
 * refusal message when the account lacks access. An open notification absorbs repeats (200).
 */
import { isAxiosError } from "axios";
import { api, login, setTokens, toStoredTokens, tokenClient } from "../api";
import { listHotspotsPage } from "../hotspots";
import {
  listStockouts,
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
    const hotspots = (await listHotspotsPage({ offset: 0, status: "active" })).items;
    expect(hotspots.every((h) => h.status === "active")).toBe(true);
    expect(hotspots.length).toBeGreaterThan(0);

    const body = {
      hot_spot_id: hotspots[0].id,
      condom_category: "male" as const,
      message: stockoutComment("Out of stock", "VHT live check"),
    };
    const res = await reportStockout(body).catch((e: unknown) => e);
    if (isAxiosError(res)) {
      // A VHT without orders:stockout_district, or a hotspot outside their district, is refused.
      expect(res.response?.status).toBe(403);
      expect(stockoutErrorMessage(res)).toMatch(/isn't allowed to send stock requests/);
    } else {
      const { report } = res as Awaited<ReturnType<typeof reportStockout>>;
      expect(report.hot_spot_id).toBe(body.hot_spot_id);
      expect(["male", "both"]).toContain(report.selection);
      expect(toLocalOrder(report, "me").source).toBe("api");
    }
  });

  it("as the hotspot manager: the request is accepted and listed for the manager", async () => {
    if (!env.CLIMS_LIVE_HM_LOGIN) return;
    const user = await signIn(env.CLIMS_LIVE_HM_LOGIN, env.CLIMS_LIVE_HM_PASSWORD);
    const body = {
      hot_spot_id: user.hot_spot_id!,
      condom_category: "female" as const,
      message: stockoutComment("Running low", "Hotspot manager live check"),
    };
    const { report, repeated } = await reportStockout(body);
    expect(report.hot_spot_id).toBe(body.hot_spot_id);
    // A repeat is counted against the open notification and widens its selection.
    expect(["female", "both"]).toContain(report.selection);
    if (!repeated) expect(report.status).toBe("awaiting_supply");
    // The manager's Orders tab lists it from GET /orders/stockouts.
    const reports = await listStockouts();
    expect(reports.map((r) => r.id)).toContain(report.id);
  });
});
