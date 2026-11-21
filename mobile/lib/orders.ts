import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAxiosError } from "axios";
import { api } from "./api";
import type { Order, OrderStatus } from "./types";

/**
 * Hotspot stockout alerts against the Go API (docs/api/openapi.json, `OrderStockoutRequest`, and
 * docs/modules/orders.md). An alert names a hotspot and a product only; the district's DCFP decides
 * the unit and quantity when sending stock.
 *
 * Today the API accepts alerts from a hotspot's assigned manager (or orders:all_stores). VHTs reporting
 * on behalf of hotspots in their district needs a backend change; until then the API refuses them and
 * the app says so (see stockoutErrorMessage).
 */

/** `OrderStockoutRequest`. */
export interface StockoutRequest {
  hot_spot_id: string;
  condom_id: string;
  comment: string | null;
}

/** `Order`, the fields the app reads. */
export interface ApiOrder {
  id: string;
  hot_spot_id: string | null;
  condom_id: string;
  order_status:
    | "pending"
    | "fulfilled"
    | "queued"
    | "reviewed"
    | "on_hold"
    | "confirmed"
    | "dispatched"
    | "received"
    | "delivered";
  comment: string | null;
  created_at: string;
}

/** A condom product the API knows, from the inventory endpoints. */
export interface Product {
  id: string;
  name: string;
}

export const COMMENT_MAX = 4000;

/** POST /orders/stockouts. */
export async function reportStockout(body: StockoutRequest): Promise<ApiOrder> {
  const { data } = await api.post<{ data: ApiOrder }>("/orders/stockouts", body);
  return data.data;
}

/** What went wrong when loading the product list. */
export type ProductsProblem = "forbidden" | "offline" | "empty" | "error";

export class ProductsUnavailable extends Error {
  constructor(public problem: ProductsProblem) {
    super(`products unavailable: ${problem}`);
  }
}

const PRODUCTS_CACHE = "clims.products.v1";

/** Normalise rows from any source into a sorted, de-duplicated product list. */
function toProducts(rows: { id: string; name: string }[]): Product[] {
  const seen = new Map<string, string>();
  for (const r of rows) if (r.id && r.name) seen.set(r.id, r.name);
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

const problemOf = (err: unknown): ProductsProblem =>
  !isAxiosError(err)
    ? "error"
    : !err.response
      ? "offline"
      : err.response.status === 403
        ? "forbidden"
        : "error";

/** `Product` from GET /catalogue/products, the fields the app reads. */
interface CatalogueProduct {
  id: string;
  category: "male" | "female" | null;
  type: "free" | "socially_marketed" | "commercial" | null;
  brand: { id: string; name: string } | null;
  active: boolean;
}

const TYPE_LABEL: Record<NonNullable<CatalogueProduct["type"]>, string> = {
  free: "Free",
  socially_marketed: "Socially marketed",
  commercial: "Commercial",
};

/** "Engabu male · Free": brand and category, then the distribution channel. Empty when unnamed. */
export function catalogueLabel(p: Omit<CatalogueProduct, "id" | "active">): string {
  const head = [p.brand?.name?.trim(), p.category].filter(Boolean).join(" ");
  return [head, p.type ? TYPE_LABEL[p.type] : ""].filter(Boolean).join(" · ");
}

/**
 * Condom products with their API ids. The catalogue (GET /catalogue/products) lists them for any active
 * account, and inactive products are left out because they can't be ordered. Servers without the
 * catalogue (404) fall back to the inventory endpoints (inventory:read), which name each product they
 * report on. The last list is kept on the phone for offline use.
 */
export async function listProducts(): Promise<Product[]> {
  let problem: ProductsProblem = "empty";
  const sources: [string, (row: any) => { id: string; name: string }][] = [
    [
      "/catalogue/products",
      (r: CatalogueProduct) => ({ id: r.active === false ? "" : r.id, name: catalogueLabel(r) }),
    ],
    [
      "/inventory/stock",
      (r: { condom_id: string; product: string }) => ({ id: r.condom_id, name: r.product }),
    ],
    [
      "/inventory/hotspots",
      (r: { condom_id: string; product: string }) => ({ id: r.condom_id, name: r.product }),
    ],
  ];
  for (const [path, map] of sources) {
    try {
      const { data } = await api.get<{ data: unknown[] }>(path);
      const list = toProducts(data.data.map(map));
      if (list.length) {
        AsyncStorage.setItem(PRODUCTS_CACHE, JSON.stringify(list)).catch(() => {});
        return list;
      }
    } catch (err) {
      // A server without the catalogue answers 404; try the next source.
      if (!(path === "/catalogue/products" && isAxiosError(err) && err.response?.status === 404))
        problem = problemOf(err);
    }
  }
  const saved = await AsyncStorage.getItem(PRODUCTS_CACHE).catch(() => null);
  if (saved) return JSON.parse(saved) as Product[];
  throw new ProductsUnavailable(problem);
}

/** Why the product list can't be shown, as a sentence for the VHT. */
export function productsProblemMessage(p: ProductsProblem): string {
  switch (p) {
    case "forbidden":
      return "Your account can't see the product list yet, so stock requests can't be sent from this phone. Your district focal person can tell you when it's switched on.";
    case "offline":
      return "Connect to the internet once to load the product list.";
    case "empty":
      return "CLIMS has no products on record yet. Call your district focal person.";
    default:
      return "Couldn't load the product list. Try again shortly.";
  }
}

/** A sentence a VHT can act on, from a refused or failed stockout alert. */
export function stockoutErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 403)
      return "CLIMS didn't accept this request: your account isn't allowed to send stock requests for this hotspot yet. Your district focal person can tell you when it's switched on, or ask the hotspot manager to send it.";
    if (s === 422)
      return "This hotspot isn't linked to a district yet, so the request has nowhere to go. Call your district focal person.";
    if (s === 404) return "That hotspot or product isn't in CLIMS any more. Refresh and try again.";
    if (s === 409) return "This hotspot already has an open request for that product.";
    if (s === 400) return "Some details weren't accepted. Check the form and try again.";
    if (!err.response)
      return "Can't reach CLIMS. Your request will be sent when you're back online.";
  }
  return "Something went wrong. Try again.";
}

const STATUS: Record<ApiOrder["order_status"], OrderStatus> = {
  queued: "queued",
  pending: "queued",
  reviewed: "review",
  on_hold: "on_hold",
  confirmed: "confirmed",
  dispatched: "dispatched",
  delivered: "delivered",
  received: "received",
  fulfilled: "received",
};

/** GET /orders: the orders the user can see (a hotspot manager: their hotspot's), newest first. */
export async function listOrders(limit = 100): Promise<ApiOrder[]> {
  const { data } = await api.get<{ data: ApiOrder[] }>("/orders", { params: { limit, offset: 0 } });
  return data.data;
}

/** The app's local copy of a stockout alert the API accepted. */
export function toLocalOrder(
  o: ApiOrder,
  names: { hotspot: string; product: string },
  by: string,
  byRole = "VHT",
): Order {
  return {
    id: o.id,
    source: "api",
    hotspotId: o.hot_spot_id ?? "",
    hotspot: names.hotspot,
    product: names.product,
    status: STATUS[o.order_status] ?? "queued",
    items: { male: 0, female: 0 },
    approved: { male: 0, female: 0 },
    reason: "Stockout alert",
    note: o.comment ?? "",
    by,
    byRole,
    createdAt: Date.parse(o.created_at) || Date.now(),
  };
}

/** The comment sent with an alert: what's happening, then the VHT's own words. */
export function stockoutComment(reason: string, comment: string): string {
  const c = comment.trim();
  return c ? `${reason}. ${c}` : reason;
}
