import { type AxiosAdapter } from "axios";
import { api } from "../api";
import {
  listMyDeliveries,
  piecesOf,
  placeOf,
  savedDeliveries,
  type RiderDelivery,
} from "../deliveries";

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (k: string) => mockStore.get(k) ?? null,
  setItem: async (k: string, v: string) => void mockStore.set(k, v),
}));

const delivery: RiderDelivery = {
  id: "d1",
  stockout_report_id: "r1",
  hot_spot_id: "h1",
  hot_spot: {
    name: "Kisenyi Landing",
    village: "Kisenyi",
    subcounty: null,
    district: "Wakiso",
    contact_name: "Peter Okello",
    contact_phone: "0700123456",
  },
  note: null,
  created_at: "2026-11-23T08:00:00Z",
  lines: [
    {
      id: "l1",
      category: "male",
      product: "Engabu Male",
      quantity: 3,
      pieces: 300,
      acknowledged_pieces: null,
    },
    {
      id: "l2",
      category: "female",
      product: "FC2 Female",
      quantity: 10,
      pieces: 100,
      acknowledged_pieces: null,
    },
  ],
  acknowledged: false,
};

describe("listMyDeliveries", () => {
  it("reads the deliveries named for the agent and keeps them for offline use", async () => {
    const sent: unknown[] = [];
    const adapter: AxiosAdapter = async (cfg) => {
      sent.push([cfg.url, cfg.params]);
      return { data: { data: [delivery] }, status: 200, statusText: "", headers: {}, config: cfg };
    };
    api.defaults.adapter = adapter;
    await expect(listMyDeliveries()).resolves.toEqual([delivery]);
    expect(sent).toEqual([["/orders/deliveries", { limit: 100, offset: 0 }]]);
    await new Promise((r) => setTimeout(r, 0));
    await expect(savedDeliveries()).resolves.toEqual([delivery]);
  });
});

describe("summaries", () => {
  it("names the known parts of the place", () => {
    expect(placeOf(delivery)).toBe("Kisenyi, Wakiso");
  });
  it("totals the pieces by category", () => {
    expect(piecesOf(delivery)).toBe("300 male · 100 female pieces");
    expect(piecesOf({ lines: [] })).toBe("No lines");
  });
});
