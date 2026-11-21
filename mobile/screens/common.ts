import { Linking } from "react-native";
import type { Tokens } from "@/constants/design";
import { chip, LOW, num, PRODUCTS, type ChipDef } from "@/lib/format";
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

/** Status chip for a hotspot, from its DCFP review step (docs/modules/hotspots.md). */
export const hotspotChip = (h: Hotspot): ChipDef =>
  h.status === "Active"
    ? chip("Active", "success")
    : h.reviewStatus === "submitted"
      ? chip("Awaiting review", "warning")
      : h.reviewStatus === "rejected"
        ? chip("Rejected", "danger")
        : chip("Inactive", "neutral");

/** Why an inactive hotspot can't get stock, for its detail page. */
export const inactiveNote = (h: Hotspot): { title: string; body: string } =>
  h.reviewStatus === "submitted"
    ? {
        title: "Awaiting district review",
        body: "The district focal person checks new hotspots before they can get stock.",
      }
    : h.reviewStatus === "rejected"
      ? {
          title: "Rejected by the district",
          body: "Call your district focal person to find out what to change.",
        }
      : {
          title: "Inactive",
          body: "Can't request stock until the district reactivates this hotspot.",
        };

/** API hotspot ids are UUIDs; only show the short sample ids (HS-0231). */
export const shortId = (id: string) => (id.length <= 12 ? id : "");
