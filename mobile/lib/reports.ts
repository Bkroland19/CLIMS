import { PRODUCTS } from "./format";
import type { ReportError, ReportForm, ReportValues } from "./types";

export interface StockField {
  k: string;
  label: string;
  hint: string;
  /** Filled in by CLIMS, not typed by the reporter. */
  sys?: boolean;
}
export interface OtherField {
  k: string;
  label: string;
  hint?: string;
  type: "num" | "sel";
  req?: boolean;
  opts?: string[];
  max?: "days" | "cover";
}
export interface FormDef {
  name: string;
  otherTitle: string;
  stock: StockField[];
  other: OtherField[];
}

export const FORMS: Record<ReportForm, FormDef> = {
  hotspot: {
    name: "Hotspot monthly report",
    otherTitle: "Service at the hotspot",
    stock: [
      { k: "open", label: "Opening balance", hint: "Last month's closing balance", sys: true },
      { k: "recv", label: "Received", hint: "Deliveries confirmed in CLIMS", sys: true },
      {
        k: "dist",
        label: "Distributed to clients",
        hint: "Taken from the dispenser or handed out",
      },
      { k: "loss", label: "Losses & adjustments", hint: "Expired, damaged or missing" },
      { k: "close", label: "Closing balance", hint: "Physical count at month end" },
    ],
    other: [
      {
        k: "daysOut",
        label: "Days out of stock",
        hint: "Days with nothing in the dispenser",
        type: "num",
        req: true,
        max: "days",
      },
      {
        k: "dispenser",
        label: "Dispenser condition",
        type: "sel",
        opts: ["Working", "Broken", "No dispenser"],
        req: true,
      },
    ],
  },
  vht: {
    name: "VHT outreach report",
    otherTitle: "Outreach",
    stock: [
      { k: "open", label: "Opening balance", hint: "Last month's closing balance", sys: true },
      { k: "recv", label: "Received", hint: "Issued to you in CLIMS", sys: true },
      { k: "dist", label: "Distributed during outreach", hint: "At hotspots and in the community" },
      { k: "loss", label: "Losses & adjustments", hint: "Expired, damaged or missing" },
      { k: "close", label: "Closing balance", hint: "Condoms you hold at month end" },
    ],
    other: [
      { k: "visited", label: "Hotspots visited", type: "num", req: true, max: "cover" },
      { k: "sessions", label: "Outreach sessions held", type: "num", req: true },
      { k: "reached", label: "People reached", type: "num", req: true },
    ],
  },
};

export const LOSS_FIELD: OtherField = {
  k: "lossReason",
  label: "Reason for losses & adjustments",
  type: "sel",
  opts: ["Expired", "Damaged", "Stolen or missing", "Count correction", "Other"],
};

export const CHECKS: [ReportError["type"], string][] = [
  ["req", "Required fields complete"],
  ["num", "Whole numbers, none negative"],
  ["bal", "Stock balances for each product"],
  ["range", "Values within range"],
];

export interface ValidateCtx {
  days: number;
  month: string;
  cover: number;
}

const blank = (x: unknown) => x == null || String(x).trim() === "";
const whole = (x: unknown) => /^\d+$/.test(String(x).trim());
const fmt = (n: number) => n.toLocaleString("en-US");

export function validateReport(F: FormDef, v: ReportValues, ctx: ValidateCtx): ReportError[] {
  const E: ReportError[] = [];
  const lbl = (k: string) => F.stock.find((f) => f.k === k)?.label ?? k;

  PRODUCTS.forEach((p) => {
    const row = v[p.k] || {};
    let bad = false;
    F.stock.forEach((f) => {
      if (f.sys) return;
      const x = row[f.k];
      const field = `${p.k}.${f.k}`;
      const where = `${p.short} · ${f.label}`;
      if (blank(x)) {
        E.push({ type: "req", field, where, msg: "Required. Enter 0 if none." });
        bad = true;
      } else if (!whole(x)) {
        E.push({ type: "num", field, where, msg: "Enter a whole number, 0 or more." });
        bad = true;
      }
    });
    if (bad) return;
    const g = (k: string) => +row[k] || 0;
    const had = g("open") + g("recv");
    const out = g("dist") + g("loss");
    const exp = had - out;
    if (out > had) {
      E.push({
        type: "bal",
        field: `${p.k}.dist`,
        where: `${p.short} · ${lbl("dist")}`,
        msg: `Distributed plus losses (${fmt(out)}) is more than you had (${fmt(had)}).`,
      });
    } else if (g("close") !== exp) {
      E.push({
        type: "bal",
        field: `${p.k}.close`,
        where: `${p.short} · ${lbl("close")}`,
        msg: `Doesn't balance — should be ${fmt(exp)}. Recount, or record the difference as a loss.`,
      });
    }
  });

  F.other.forEach((f) => {
    const x = v[f.k];
    if (blank(x)) {
      if (f.req) {
        E.push({
          type: "req",
          field: f.k,
          where: f.label,
          msg: f.type === "sel" ? "Choose one." : "Required. Enter 0 if none.",
        });
      }
      return;
    }
    if (f.type === "num" && !whole(x)) {
      E.push({ type: "num", field: f.k, where: f.label, msg: "Enter a whole number, 0 or more." });
      return;
    }
    const mx = f.max === "days" ? ctx.days : f.max === "cover" ? ctx.cover : null;
    if (mx != null && +x > mx) {
      E.push({
        type: "range",
        field: f.k,
        where: f.label,
        msg:
          f.max === "days"
            ? `${ctx.month} has ${mx} days. Enter 0–${mx}.`
            : `You cover ${mx} hotspots. Enter 0–${mx}.`,
      });
    }
  });

  const anyLoss = PRODUCTS.some((p) => whole(v[p.k]?.loss) && +v[p.k].loss > 0);
  if (anyLoss && blank(v.lossReason)) {
    E.push({
      type: "req",
      field: "lossReason",
      where: "Reason for losses",
      msg: "Say why stock was lost or adjusted.",
    });
  }
  return E;
}
