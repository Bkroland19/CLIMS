/**
 * Domain model for the field app (VHT, hotspot manager, rider).
 *
 * The Go API does not serve hotspots, orders, deliveries or reports yet, so these
 * shapes follow the CLIMS prototype. Keep them in step with the API once it lands.
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
  kind: "Permanent" | "Temporary";
  village: string;
  subcounty: string;
  district: string;
  status: "Active" | "Inactive";
  contact: string;
  phone: string;
  vhts: string[];
  stock: Qty;
  lat?: number;
  lng?: number;
  dispenser: boolean;
  dispCond?: string;
  dispPhoto?: string;
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

export type ReportStatus = "draft" | "errors" | "validated" | "sent";
export type ReportForm = "hotspot" | "vht";

export interface ReportError {
  type: "req" | "num" | "bal" | "range";
  field: string;
  where: string;
  msg: string;
}

/** Stock rows keyed by product, then scalar fields such as `daysOut`, `comment`. */
export type ReportValues = Record<string, any>;

export interface Report {
  id: string;
  own: AppRole;
  form: ReportForm;
  period: string; // YYYY-MM
  status: ReportStatus;
  values: ReportValues;
  errors: ReportError[];
  runs: number;
  savedAt?: number;
  sentAt?: number;
  receipt?: string;
  reporter?: string;
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
  "notify" | "mapHotspot" | "confirmReceipt" | "pickup" | "deliver" | "rptSave" | "rptSend";

export interface DomainState {
  hotspots: Hotspot[];
  orders: Order[];
  reports: Report[];
  events: AppEvent[];
  outbox: OutboxItem[];
  read: Partial<Record<AppRole, number>>;
  seq: number;
}
