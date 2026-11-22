import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * Stock against the Go API (docs/modules/inventory.md). A store's stock of a product in a unit is
 * held in batches, each with an optional batch number and expiry date; the balance is their sum.
 * Stock leaves first expiry first out and expired batches never leave. Dates are Uganda's.
 */

const text = z.string().nullable();
const count = z.number().int();

const balanceSchema = z.object({
  store_id: z.string(),
  store_name: z.string(),
  store_type: z.enum(['national', 'district']),
  condom_id: z.string(),
  product: z.string(),
  unit_of_measure_id: z.string(),
  unit: z.string(),
  on_hand: count,
  /** Held for confirmed orders. */
  reserved: count,
  /** On hand less reserved; expired stock is still counted here (see the batches). */
  available: count,
  /** Dispatched to the store and not yet received. */
  incoming: count,
  updated_at: z.string(),
});

export type StockBalance = z.infer<typeof balanceSchema>;

/** Shelf life left in calendar months, as the API bands it; `unknown` has no expiry date. */
export const BANDS = [
  'expired',
  'under_1_month',
  'under_3_months',
  'under_6_months',
  'ok',
  'unknown',
] as const;
export type Band = (typeof BANDS)[number];

const batchSchema = z.object({
  id: z.string(),
  store_id: z.string(),
  store_name: z.string(),
  store_type: z.enum(['national', 'district']),
  condom_id: z.string(),
  product: z.string(),
  category: z.enum(['male', 'female']).nullable(),
  unit_of_measure_id: z.string(),
  unit: z.string(),
  /** Null for stock recorded without batch details. */
  batch_number: text,
  /** YYYY-MM-DD. */
  expiry_date: text,
  /** Negative once expired; null without an expiry date. */
  days_remaining: count.nullable(),
  band: z.enum(BANDS),
  on_hand: count,
  created_at: z.string(),
});

export type StockBatch = z.infer<typeof batchSchema>;

export interface StockFilter {
  storeId?: string;
  condomId?: string;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Store balances, one per product and unit. */
export async function listStock(
  http: HttpClient,
  filter: StockFilter,
  signal?: AbortSignal,
): Promise<StockBalance[]> {
  const body = await http.get(
    `/inventory/stock${query({ store_id: filter.storeId, condom_id: filter.condomId })}`,
    { signal },
  );
  return parseList(balanceSchema, body, 'stock');
}

/**
 * Batches with stock, in the order dispatch takes them within each product and unit: earliest
 * expiry first, unknown expiry last.
 */
export async function listBatches(
  http: HttpClient,
  filter: StockFilter,
  signal?: AbortSignal,
): Promise<StockBatch[]> {
  const body = await http.get(
    `/inventory/batches${query({ store_id: filter.storeId, condom_id: filter.condomId })}`,
    { signal },
  );
  return parseList(batchSchema, body, 'batches');
}

/** Why stock changed: a delivery or adjustment recorded by hand, or a step of the order workflow. */
export const MOVEMENT_REASONS = [
  'opening',
  'receipt',
  'adjustment',
  'dispatch',
  'order_receipt',
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

const movementSchema = z.object({
  id: z.string(),
  store_id: z.string(),
  store_name: z.string(),
  condom_id: z.string(),
  product: z.string(),
  unit_of_measure_id: z.string(),
  unit: z.string(),
  reason: z.enum(MOVEMENT_REASONS),
  /** Positive adds stock, negative takes it away. */
  quantity: count,
  /** The store's balance of the product in the unit after this entry. */
  on_hand_after: count,
  order_id: text,
  actor_id: text,
  note: text,
  created_at: z.string(),
  /** The batch a receipt or adjustment changed; null for order steps. */
  batch_number: text.default(null),
  expiry_date: text.default(null),
});

export type Movement = z.infer<typeof movementSchema>;

/** The store's ledger, newest first. */
export async function listMovements(
  http: HttpClient,
  filter: { storeId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<Movement[]> {
  const body = await http.get(
    `/inventory/movements${query({ store_id: filter.storeId, limit: String(filter.limit ?? 100) })}`,
    { signal },
  );
  return parseList(movementSchema, body, 'stock movements');
}

export interface MovementInput {
  store_id: string;
  condom_id: string;
  unit_of_measure_id: string;
  /** A delivery adds stock; an adjustment corrects a batch either way and needs a note. */
  reason: 'receipt' | 'adjustment';
  /** Signed for an adjustment; positive for a receipt. */
  quantity: number;
  note?: string;
  /** The batch: leave both out for stock without batch details. */
  batch_number?: string;
  /** YYYY-MM-DD. */
  expiry_date?: string;
}

/** Records a delivery into a batch, or corrects a batch; returns the ledger entry. */
export async function recordMovement(http: HttpClient, input: MovementInput): Promise<Movement> {
  return parseBody(
    movementSchema,
    await http.post('/inventory/movements', input),
    'stock movement',
  );
}
