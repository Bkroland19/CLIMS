import { z } from 'zod';

import { parseList, type HttpClient } from '@/lib/api';

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
