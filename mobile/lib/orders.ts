import { isAxiosError } from "axios";
import { api } from "./api";
import type { Order, OrderStatus } from "./types";

/**
 * Hotspot stockout alerts against the Go API (docs/api/openapi.json, `OrderStockoutRequest`, and
 * docs/modules/orders.md). An alert names a hotspot and a condom category (male, female or both)
 * only; the district's DCFP decides what to send and how much.
 */

/** The condom category an alert names. */
export type Category = "male" | "female" | "both";

export const CATEGORY_LABEL: Record<Category, string> = {
  male: "Male condoms",
  female: "Female condoms",
  both: "Male and female condoms",
};

/** `OrderStockoutRequest`. */
export interface StockoutRequest {
  hot_spot_id: string;
  condom_category: Category;
  message: string | null;
}

/** `Order`, the fields the app reads. */
export interface ApiOrder {
  id: string;
  hot_spot_id: string | null;
  condom_id: string | null;
  /** The condom category requested or reported. */
  condom_category?: "male" | "female" | null;
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

export const COMMENT_MAX = 4000;

/** POST /orders/stockouts. */
export async function reportStockout(body: StockoutRequest): Promise<ApiOrder> {
  const { data } = await api.post<{ data: ApiOrder }>("/orders/stockouts", body);
  return data.data;
}

/** A sentence a VHT can act on, from a refused or failed stockout alert. */
export function stockoutErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 403)
      return "CLIMS didn't accept this request: your account isn't allowed to send stock requests for this hotspot yet. Your district focal person can tell you when it's switched on, or ask the hotspot manager to send it.";
    if (s === 422)
      return "This hotspot isn't linked to a district yet, so the request has nowhere to go. Call your district focal person.";
    if (s === 404) return "That hotspot isn't in CLIMS any more. Refresh and try again.";
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
  const { data } = await api.get<{ data: ApiOrder[] }>("/orders", {
    params: { limit, offset: 0 },
  });
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

/**
 * A request saved on the phone before alerts named a category ({condom_id, comment}), in today's
 * shape, so it is not lost when it is finally sent. The category is read from the product name
 * saved with it; a name without one asks for both.
 */
export function currentStockoutRequest(
  request: StockoutRequest | { hot_spot_id: string; condom_id?: string; comment?: string | null },
  product: string,
): StockoutRequest {
  if ("condom_category" in request) return request;
  const name = product.toLowerCase();
  const condom_category: Category = /\bfemale\b/.test(name)
    ? "female"
    : /\bmale\b/.test(name)
      ? "male"
      : "both";
  return {
    hot_spot_id: request.hot_spot_id,
    condom_category,
    message: request.comment ?? null,
  };
}
