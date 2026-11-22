import AsyncStorage from "@react-native-async-storage/async-storage";
import { isAxiosError } from "axios";
import { api } from "./api";
import type { Order, OrderStatus } from "./types";

/**
 * Hotspot stockout notifications against the Go API (docs/api/openapi.json, `OrderStockoutRequest`
 * and `StockoutReport`, and docs/modules/orders.md). A notification names a hotspot and a condom
 * category (male, female or both) and no product or quantity; the district's DCFP decides what to
 * send. A hotspot with an open notification doesn't raise a second one: the API counts the message
 * against the open one (200 instead of 201) and widens its category, so male then female is both.
 * The report returns the category as `selection` and the message as `comment`.
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

/** Where a notification is in its fulfilment. */
export type StockoutStatus =
  "awaiting_supply" | "awaiting_acknowledgement" | "partly_received" | "fulfilled";

/** `StockoutReport`, the fields the app reads. */
export interface StockoutReport {
  id: string;
  hot_spot_id: string;
  hot_spot: { name: string; district: string | null };
  /** Set only for notifications sent by product (older clients). */
  condom_id: string | null;
  product: string;
  /** The category asked for (the request's condom_category, widened by repeats). */
  selection: Category;
  reported_by: string;
  comment: string | null;
  repeat_count: number;
  status: StockoutStatus;
  fulfilled_at: string | null;
  created_at: string;
  last_reported_at: string;
}

/** A delivery line the district recorded: a product of one selected type, counted in pieces. */
export interface DeliveryLine {
  id: string;
  category: "male" | "female";
  product: string;
  /** In the product's catalogue unit (e.g. boxes). */
  quantity: number;
  /** `quantity` converted to pieces: what the manager counts. */
  pieces: number;
  acknowledged_pieces: number | null;
  acknowledged_at: string | null;
}

export interface HotspotDelivery {
  id: string;
  note: string | null;
  created_at: string;
  lines: DeliveryLine[];
}

export interface StockoutEvent {
  id: string;
  action: "raised" | "repeated" | "selection_changed" | "delivered" | "acknowledged";
  selection: Category;
  created_at: string;
}

/** `StockoutDetail`: a notification with its deliveries and history. */
export interface StockoutDetail extends StockoutReport {
  deliveries: HotspotDelivery[];
  events: StockoutEvent[];
}

/** `AcknowledgementRequest`: pieces actually received per delivery line, zero when nothing came. */
export interface AcknowledgementRequest {
  lines: { line_id: string; pieces: number }[];
}

export const COMMENT_MAX = 4000;

/**
 * POST /orders/stockouts. `repeated` is true when the hotspot already had an open notification and
 * the API counted this message against it (200) rather than raising a new one (201).
 */
export async function reportStockout(
  body: StockoutRequest,
): Promise<{ report: StockoutReport; repeated: boolean }> {
  const res = await api.post<{ data: StockoutReport }>("/orders/stockouts", body);
  return { report: res.data.data, repeated: res.status === 200 };
}

const DETAIL_CACHE = (id: string) => `clims.stockout.v1.${id}`;

/** GET /orders/stockouts/{id}. The last copy is kept on the phone for offline use. */
export async function getStockout(id: string): Promise<StockoutDetail> {
  const { data } = await api.get<{ data: StockoutDetail }>(`/orders/stockouts/${id}`);
  saveStockout(data.data);
  return data.data;
}

/** The phone's last copy of a notification's details, or null. */
export async function savedStockout(id: string): Promise<StockoutDetail | null> {
  const raw = await AsyncStorage.getItem(DETAIL_CACHE(id)).catch(() => null);
  return raw ? (JSON.parse(raw) as StockoutDetail) : null;
}

function saveStockout(d: StockoutDetail) {
  AsyncStorage.setItem(DETAIL_CACHE(d.id), JSON.stringify(d)).catch(() => {});
}

/**
 * POST /orders/stockouts/{id}/acknowledgements. Resending a line's same count is accepted, so a
 * retried send from the outbox is safe; a different count is refused (409).
 */
export async function acknowledgeStockout(
  id: string,
  body: AcknowledgementRequest,
): Promise<StockoutDetail> {
  const { data } = await api.post<{ data: StockoutDetail }>(
    `/orders/stockouts/${id}/acknowledgements`,
    body,
  );
  saveStockout(data.data);
  return data.data;
}

/** Delivery lines still waiting for the manager's count. */
export const unacknowledged = (d: Pick<StockoutDetail, "deliveries">): DeliveryLine[] =>
  d.deliveries.flatMap((dl) => dl.lines.filter((l) => l.acknowledged_pieces == null));

/** A sentence a hotspot manager can act on, from a refused or failed acknowledgement. */
export function acknowledgeErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 403)
      return "Only the hotspot's manager can confirm what arrived. If that's you, call your district focal person to link your account to this hotspot.";
    if (s === 409)
      return "CLIMS already has a different count for this delivery, and counts can't be changed from the phone. Call your district focal person to correct it.";
    if (s === 404) return "This request isn't in CLIMS any more. Go back and refresh.";
    if (s === 400 || s === 422) return "Some counts weren't accepted. Check them and try again.";
    if (!err.response) return "Can't reach CLIMS. Your count will be sent when you're back online.";
  }
  return "Something went wrong. Try again.";
}

/** GET /orders/stockouts: the notifications the user can see (a manager: their hotspot's), newest first. */
export async function listStockouts(limit = 100): Promise<StockoutReport[]> {
  const { data } = await api.get<{ data: StockoutReport[] }>("/orders/stockouts", {
    params: { limit, offset: 0 },
  });
  return data.data;
}

/** A sentence a VHT can act on, from a refused or failed stockout alert. */
export function stockoutErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const s = err.response?.status;
    if (s === 403)
      return "CLIMS didn't accept this request: your account isn't allowed to send stock requests for this hotspot yet. Your district focal person can tell you when it's switched on, or ask the hotspot manager to send it.";
    if (s === 422) {
      const msg = String((err.response?.data as { message?: unknown } | undefined)?.message ?? "");
      // Field checks (condom_category, message, hotspot UUID); otherwise the hotspot has no district.
      if (/condom_category|message|uuid/i.test(msg))
        return "Some details weren't accepted. Check the form and try again.";
      return "This hotspot isn't linked to a district yet, so the request has nowhere to go. Call your district focal person.";
    }
    if (s === 404) return "That hotspot isn't in CLIMS any more. Refresh and try again.";
    if (s === 400) return "Some details weren't accepted. Check the form and try again.";
    if (!err.response)
      return "Can't reach CLIMS. Your request will be sent when you're back online.";
  }
  return "Something went wrong. Try again.";
}

const STATUS: Record<StockoutStatus, OrderStatus> = {
  awaiting_supply: "queued",
  awaiting_acknowledgement: "delivered",
  partly_received: "delivered",
  fulfilled: "received",
};

/** What a notification asks for: its product for older by-product notifications, else the selection. */
export function stockoutProduct(r: Pick<StockoutReport, "condom_id" | "product" | "selection">) {
  return r.condom_id && r.product ? r.product : (CATEGORY_LABEL[r.selection] ?? r.product);
}

/** The app's local copy of a stockout notification the API accepted. */
export function toLocalOrder(r: StockoutReport, by: string, byRole = "VHT"): Order {
  return {
    id: r.id,
    source: "api",
    hotspotId: r.hot_spot_id,
    hotspot: r.hot_spot?.name ?? "",
    product: stockoutProduct(r),
    status: STATUS[r.status] ?? "queued",
    items: { male: 0, female: 0 },
    approved: { male: 0, female: 0 },
    reason: "Stockout alert",
    note: r.comment ?? "",
    by: r.reported_by || by,
    byRole,
    createdAt: Date.parse(r.created_at) || Date.now(),
  };
}

/** The comment sent with an alert: what's happening, then the VHT's own words. */
export function stockoutComment(reason: string, comment: string): string {
  const c = comment.trim();
  return c ? `${reason}. ${c}` : reason;
}

/** Shapes older versions of the app saved in the outbox before alerts named a condom_category. */
type SavedStockoutRequest =
  | StockoutRequest
  | { hot_spot_id: string; selection?: Category; condom_id?: string; comment?: string | null };

/**
 * A request saved on the phone in an older shape, in today's, so it is not lost when it is finally
 * sent: {selection, comment} keeps its category; {condom_id, comment} takes the category from the
 * product name saved with it, and a name without one asks for both.
 */
export function currentStockoutRequest(
  request: SavedStockoutRequest,
  product: string,
): StockoutRequest {
  if ("condom_category" in request) return request;
  if (request.selection)
    return {
      hot_spot_id: request.hot_spot_id,
      condom_category: request.selection,
      message: request.comment ?? null,
    };
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
