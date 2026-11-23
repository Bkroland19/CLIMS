import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * Stock-holding points (national warehouses and district stores) and the
 * geography they sit in (regions, districts, sub-counties), synced from DHIS2.
 *
 * Stores come from the Go API, with inventory access scoped to the user's store.
 * Geography and sync are still served only by the mock API (`dev/mock/admin.mts`).
 *
 *   GET  /stores          → Store[]
 *   GET  /geography       → Geography
 *   POST /geography/sync  → { synced_at, changes }
 */

const count = z.number().int().nonnegative();

export const STORE_KINDS = ['national', 'district'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(STORE_KINDS),
  region: z.string().nullable(),
  district: z.string().nullable(),
  /** `nms` / `jms` for the national warehouses; the DHIS2 org unit id for district stores. */
  code: z.string(),
  user_count: count,
  /** Physical stock, including reserved and expired stock, grouped by category and unit. */
  on_hand: z.array(
    z.object({
      category: z.enum(['male', 'female']).nullable(),
      unit_id: z.string(),
      unit: z.string(),
      quantity: count,
    }),
  ),
});

export type Store = z.infer<typeof storeSchema>;

const subcountySchema = z.object({
  id: z.string(),
  name: z.string(),
  facility_count: count,
  hotspot_count: count,
});

const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  store_count: count,
  hotspot_count: count,
  subcounties: z.array(subcountySchema),
});

const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  district_count: count,
  districts: z.array(districtSchema),
});

const geographySchema = z.object({
  synced_at: z.string().nullable(),
  counts: z.object({
    regions: count,
    districts: count,
    subcounties: count,
    facilities: count,
  }),
  regions: z.array(regionSchema),
});

export type Geography = z.infer<typeof geographySchema>;
export type Region = z.infer<typeof regionSchema>;
export type District = z.infer<typeof districtSchema>;

const syncResultSchema = z.object({ synced_at: z.string(), changes: count });
export type SyncResult = z.infer<typeof syncResultSchema>;

export async function listStores(http: HttpClient, signal?: AbortSignal): Promise<Store[]> {
  return parseList(storeSchema, await http.get('/stores', { signal }), 'stores');
}

export async function getGeography(http: HttpClient, signal?: AbortSignal): Promise<Geography> {
  return parseBody(geographySchema, await http.get('/geography', { signal }), 'geography');
}

export async function syncGeography(http: HttpClient): Promise<SyncResult> {
  return parseBody(syncResultSchema, await http.post('/geography/sync'), 'geography sync');
}

export function storeKindLabel(kind: StoreKind): string {
  return kind === 'national' ? 'National' : 'District';
}
