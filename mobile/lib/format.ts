import type { BatchLine, OrderStatus, ProductKey, Qty } from "./types";

export type Tone = "info" | "success" | "warning" | "danger" | "neutral";
export interface ChipDef {
  label: string;
  tone: Tone;
}

export const PRODUCTS: { k: ProductKey; name: string; short: string; brand: string }[] = [
  { k: "male", name: "Male condoms", short: "Male", brand: "Engabu" },
  { k: "female", name: "Female condoms", short: "Female", brand: "FC2" },
];

/** Below this many pieces a hotspot is "running low". */
export const LOW: Qty = { male: 500, female: 50 };

export const num = (n: number | string | undefined | null) => {
  const v = typeof n === "number" ? n : parseInt(String(n ?? "").replace(/[^0-9]/g, ""), 10);
  return isNaN(v) ? "0" : v.toLocaleString("en-US");
};

/** Parse a user-typed quantity; anything that is not a number counts as 0. */
export const toInt = (x: unknown) => {
  const n = parseInt(String(x ?? "").replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

/** "1,000 male · 50 female", or an em dash when both are zero. */
export const items = (q?: Partial<Qty> | null) => {
  if (!q) return "—";
  const parts = PRODUCTS.filter((p) => (q[p.k] ?? 0) > 0).map(
    (p) => `${num(q[p.k] ?? 0)} ${p.short.toLowerCase()}`,
  );
  return parts.length ? parts.join(" · ") : "—";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Relative time for lists: "just now", "12 min ago", "3 h ago", "yesterday", "Mon 12 Oct". */
export const ago = (t?: number, now = Date.now()) => {
  if (t == null) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  const d = new Date(t);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `${Math.floor(s / 3600)} h ago`;
  const y = new Date(now - 86400000);
  if (d.toDateString() === y.toDateString()) return "yesterday";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const dateLabel = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const chip = (label: string, tone: Tone): ChipDef => ({ label, tone });

const ORDER_CHIPS: Record<OrderStatus, ChipDef> = {
  queued: chip("Sent", "info"),
  review: chip("In review", "info"),
  on_hold: chip("On hold", "warning"),
  confirmed: chip("Confirmed", "info"),
  dispatched: chip("Rider assigned", "info"),
  in_transit: chip("On the way", "info"),
  delivered: chip("Delivered", "success"),
  received: chip("Received", "neutral"),
  rejected: chip("Rejected", "danger"),
};
export const orderChip = (s: OrderStatus) => ORDER_CHIPS[s];

export interface LineRow extends BatchLine {
  short: string;
  left: string;
}

export const lineRows = (lines: BatchLine[] = []): LineRow[] =>
  lines.map((l) => {
    const p = PRODUCTS.find((x) => x.k === l.k)!;
    return { ...l, short: p.short, left: `${num(l.qty)} pcs`, qty: l.qty };
  });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2);
