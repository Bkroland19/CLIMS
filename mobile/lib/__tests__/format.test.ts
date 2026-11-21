import { items, orderChip, toInt } from "../format";
import { createSeed, DEFAULT_PERSONAS } from "../seed";
import { withoutReports } from "../store";

jest.mock("@react-native-async-storage/async-storage", () => ({}));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => {} }));
jest.mock("expo-secure-store", () => ({}));

describe("format helpers", () => {
  it("summarises quantities", () => {
    expect(items({ male: 2000, female: 100 })).toBe("2,000 male · 100 female");
    expect(items({ male: 0, female: 0 })).toBe("—");
  });
  it("parses typed quantities", () => {
    expect(toInt("1,200")).toBe(1200);
    expect(toInt("")).toBe(0);
  });
  it("labels order states", () => {
    expect(orderChip("in_transit")).toEqual({ label: "On the way", tone: "info" });
  });
});

describe("seed", () => {
  it("gives every role something to work on", () => {
    const s = createSeed(DEFAULT_PERSONAS);
    expect(s.hotspots.some((h) => h.vhts.includes(DEFAULT_PERSONAS.vht))).toBe(true);
    expect(s.orders.some((o) => o.status === "dispatched")).toBe(true);
    expect(s.orders.some((o) => o.status === "in_transit" && o.hotspotId === "HS-0231")).toBe(true);
    expect("reports" in s).toBe(false);
  });
});

describe("saved state from older versions", () => {
  it("drops monthly reports, their notifications and queued report saves", () => {
    const s = createSeed(DEFAULT_PERSONAS);
    const old = {
      ...s,
      reports: [{ id: "RPT-HM-2026-09" }],
      events: [{ ...s.events[0], ref: "RPT-HM-2026-09" }, ...s.events],
      outbox: [{ id: "q1", type: "rptSend", payload: {}, label: "", role: "hm", at: 0 }],
    };
    const out = withoutReports(old as never);
    expect("reports" in out).toBe(false);
    expect(out.events).toEqual(s.events);
    expect(out.outbox).toEqual([]);
  });
});
