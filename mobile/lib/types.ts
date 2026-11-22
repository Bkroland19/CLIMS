/**
 * Domain model for the field app (VHT, hotspot manager, rider).
 *
 * Hotspots are submitted to the Go API (lib/hotspots.ts). Orders and deliveries have no
 * mobile endpoints yet, so those shapes follow the CLIMS prototype.
 */

export type AppRole = "vht" | "hm" | "rider";

export type ProductKey = "male" | "female";
export type Qty = Record<ProductKey, number>;

export type OrderStatus =
  | "queued"
  | "review"
  | "on_hold"
  | "confirmed"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "received";

export interface Hotspot {
  id: string;
  name: string;
  /** Free text, as the API stores it: "Bar", "Lodge", "Landing site"… */
  type: string;
  village: string;
  subcounty: string;
  district: string;
  region?: string;
  status: "Active" | "Inactive";
  /** "api" for hotspots loaded from or submitted to the backend; absent on sample data. */
  source?: "api";
  /** The DCFP review step (docs/modules/hotspots.md); absent on sample hotspots. */
  reviewStatus?: "submitted" | "rejected" | "active" | "deactivated";
  contact: string;
  phone: string;
  vhts: string[];
  stock: Qty;
  lat?: number;
  lng?: number;
  dispenser: boolean;
  dispCond?: string;
  comment?: string;
  mappedAt?: number;
  lastDelivery?: number;
}

export interface BatchLine {
  k: ProductKey;
  batch: string;
  exp: string;
  qty: number;
}

export interface Delivery {
  riderId: string;
  rider: string;
  phone: string;
  plate: string;
  dn: string;
  at: number;
  lines: BatchLine[];
  pickedAt?: number;
  deliveredAt?: number;
  qty?: Qty;
  found?: Qty;
  recipient?: string;
  /** Local image URI of the signed delivery note. */
  photo?: string;
  /** SVG path data of the recipient's signature. */
  sig?: string;
}

export interface Receipt {
  at: number;
  qty: Qty;
  issue: string;
  by: string;
}

export interface Order {
  id: string;
  /** "api" for stockout alerts sent to the backend; absent on sample data. */
  source?: "api";
  /** Product named by an API stockout alert (alerts carry no quantities). */
  product?: string;
  hotspotId: string;
  hotspot: string;
  status: OrderStatus;
  items: Qty;
  approved: Qty;
  remaining?: Qty;
  reason: string;
  note?: string;
  by: string;
  byRole: string;
  createdAt: number;
  confirmedAt?: number;
  delivery?: Delivery;
  receipt?: Receipt;
}

export type EventRole =
  "DCFP" | "Rider" | "MOH" | "NMS" | "JMS" | "System" | "Hotspot manager" | "VHT";

export interface AppEvent {
  id: string;
  t: number;
  ref: string;
  role: EventRole;
  actor: string;
  text: string;
  /** Roles this notification is for. */
  to: AppRole[];
}

export interface OutboxItem {
  id: string;
  type: ActionType;
  payload: any;
  label: string;
  role: AppRole;
  at: number;
}

export type ActionType =
  "notify" | "stockout" | "acknowledge" | "mapHotspot" | "confirmReceipt" | "pickup" | "deliver";

export interface DomainState {
  hotspots: Hotspot[];
  orders: Order[];
  events: AppEvent[];
  outbox: OutboxItem[];
  read: Partial<Record<AppRole, number>>;
  seq: number;
}
