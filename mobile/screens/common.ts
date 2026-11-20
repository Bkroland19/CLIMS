import { Linking } from "react-native";
import type { Tokens } from "@/constants/design";
import { LOW, num, PRODUCTS } from "@/lib/format";
import type { Stat } from "@/components/m/kit";
import type { Hotspot, ProductKey } from "@/lib/types";

export const call = (phone: string) =>
  Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, "")}`).catch(() => {});

export const stockTone = (T: Tokens, q: number, k: ProductKey): [string, string] =>
  q === 0
    ? [T.danger, "Out of stock"]
    : q < LOW[k]
      ? [T.warnFg, "Running low"]
      : [T.fg, "In stock"];

export const stockStats = (T: Tokens, h: Hotspot): Stat[] =>
  PRODUCTS.map((p) => {
    const q = h.stock[p.k];
    const [fg, note] = stockTone(T, q, p.k);
    return { label: `${p.short} condoms`, value: num(q), fg, note };
  });

export const firstName = (n: string) => n.split(" ")[0] ?? n;

export const matches = (q: string, ...fields: (string | undefined)[]) =>
  !q.trim() || fields.join(" ").toLowerCase().includes(q.trim().toLowerCase());
