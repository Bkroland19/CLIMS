import { FORMS, validateReport } from "../reports";
import { items, orderChip, periodOf, toInt } from "../format";
import { createSeed, currentPeriod, DEFAULT_PERSONAS } from "../seed";

const ctx = { days: 31, month: "October", cover: 4 };

const balanced = {
  male: { open: 1560, recv: 1500, dist: 1000, loss: 0, close: 2060 },
  female: { open: 100, recv: 100, dist: 50, loss: 0, close: 150 },
  daysOut: "2",
  dispenser: "Working",
};

describe("validateReport", () => {
  it("passes a balanced hotspot report", () => {
    expect(validateReport(FORMS.hotspot, balanced, ctx)).toEqual([]);
  });

  it("flags blanks as required", () => {
    const errs = validateReport(
      FORMS.hotspot,
      { male: { open: 10, recv: 0 }, female: { open: 0, recv: 0 } },
      ctx,
    );
    expect(errs.filter((e) => e.type === "req").map((e) => e.field)).toEqual(
      expect.arrayContaining(["male.dist", "male.loss", "male.close", "daysOut", "dispenser"]),
    );
  });

  it("explains a closing balance that doesn't add up", () => {
    const v = { ...balanced, male: { ...balanced.male, close: 2000 } };
    const [e] = validateReport(FORMS.hotspot, v, ctx);
    expect(e).toMatchObject({ type: "bal", field: "male.close" });
    expect(e.msg).toContain("2,060");
  });

  it("rejects distributing more than was held", () => {
    const v = { ...balanced, female: { ...balanced.female, dist: 500, close: 0 } };
    expect(validateReport(FORMS.hotspot, v, ctx)[0]).toMatchObject({
      type: "bal",
      field: "female.dist",
    });
  });

  it("keeps days out of stock within the month", () => {
    const errs = validateReport(FORMS.hotspot, { ...balanced, daysOut: "40" }, ctx);
    expect(errs).toEqual([
      expect.objectContaining({
        type: "range",
        field: "daysOut",
        msg: "October has 31 days. Enter 0–31.",
      }),
    ]);
  });

  it("asks why stock was lost", () => {
    const v = { ...balanced, male: { ...balanced.male, loss: 60, close: 2000 } };
    expect(validateReport(FORMS.hotspot, v, ctx)).toEqual([
      expect.objectContaining({ field: "lossReason" }),
    ]);
    expect(validateReport(FORMS.hotspot, { ...v, lossReason: "Damaged" }, ctx)).toEqual([]);
  });

  it("limits hotspots visited to the VHT's coverage", () => {
    const v = {
      male: balanced.male,
      female: balanced.female,
      visited: "9",
      sessions: "2",
      reached: "40",
    };
    expect(validateReport(FORMS.vht, v, ctx)).toEqual([
      expect.objectContaining({ type: "range", field: "visited" }),
    ]);
  });
});

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
  it("derives the reporting period and due date", () => {
    expect(periodOf("2026-10")).toEqual({
      label: "October 2026",
      month: "October",
      days: 31,
      due: "20 Nov 2026",
    });
    expect(currentPeriod(new Date(2026, 10, 19).getTime())).toBe("2026-10");
  });
});

describe("seed", () => {
  it("gives every role something to work on", () => {
    const s = createSeed(DEFAULT_PERSONAS);
    expect(s.hotspots.some((h) => h.vhts.includes(DEFAULT_PERSONAS.vht))).toBe(true);
    expect(s.orders.some((o) => o.status === "dispatched")).toBe(true);
    expect(s.orders.some((o) => o.status === "in_transit" && o.hotspotId === "HS-0231")).toBe(true);
    expect(
      s.reports
        .filter((r) => r.status !== "sent")
        .map((r) => r.own)
        .sort(),
    ).toEqual(["hm", "vht"]);
  });
});
