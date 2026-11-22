import { z } from 'zod';

import { parseList, readAllPages, type HttpClient } from '@/lib/api';

/*
 * Uganda's administrative places as the Go API knows them: regions, their
 * districts and the districts' subcounties, as UUID tables served by the shared
 * location lookups (`backend/internal/features/locations`, open to any active
 * signed-in user). There is no parish or village table: hotspots record
 * their village as text, so villages are suggested from the hotspots already
 * mapped in a subcounty, and hotspot managers pick their hotspot from a district's.
 *
 *   GET /locations/regions                        [{ id, name }]
 *   GET /locations/districts?region_id=           [{ id, name }]
 *   GET /locations/subcounties?district_id=       [{ id, name }]
 *   GET /hotspots?district_id=&limit=&offset=     [{ id, name, village, subcounty, review_status }]
 *   GET /locations/stores                         [{ id, code, name, store_type, district_id, district_name }]
 */

const placeSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1) });

export type Place = z.infer<typeof placeSchema>;

export async function listRegions(http: HttpClient, signal?: AbortSignal): Promise<Place[]> {
  return parseList(placeSchema, await http.get('/locations/regions', { signal }), 'regions');
}

export async function listDistrictsIn(
  http: HttpClient,
  regionId: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const query = new URLSearchParams({ region_id: regionId }).toString();
  return parseList(
    placeSchema,
    await http.get(`/locations/districts?${query}`, { signal }),
    'districts',
  );
}

export async function listSubcounties(
  http: HttpClient,
  districtId: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const query = new URLSearchParams({ district_id: districtId }).toString();
  return parseList(
    placeSchema,
    await http.get(`/locations/subcounties?${query}`, { signal }),
    'subcounties',
  );
}

/**
 * What the user form needs from a hotspot: enough to find and name it in a
 * picker, and to suggest its village. Legacy rows can lack a name, village or
 * subcounty (most converted ones have no subcounty).
 */
const hotspotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullish(),
    village: z.string().nullish(),
    // The current API nests the subcounty; the earlier one sent its id flat.
    subcounty: z.object({ id: z.string(), name: z.string().nullish() }).nullish(),
    subcounty_id: z.string().nullish(),
    review_status: z.string().nullish(),
    // The earlier API kept the review step in `status`; the current one sends active or inactive there.
    status: z.string().nullish(),
  })
  .transform((hotspot) => ({
    id: hotspot.id,
    name: hotspot.name?.trim() ?? '',
    village: hotspot.village?.trim() ?? '',
    subcountyId: hotspot.subcounty?.id ?? hotspot.subcounty_id ?? null,
    subcountyName: hotspot.subcounty?.name?.trim() ?? '',
    /** `submitted`, `rejected`, `active` or `deactivated`; blank when the API leaves it out. */
    reviewStatus: (hotspot.review_status ?? hotspot.status)?.trim().toLowerCase() ?? '',
  }));

export type PlacedHotspot = z.output<typeof hotspotSchema>;

const PAGE_SIZE = 100;
/** Pages asked for at once. */
const PAGES_AT_ONCE = 4;
/** 5,000 hotspots; the busiest district has under half that today. */
const MAX_PAGES = 50;

/**
 * Every hotspot in a district the viewer can see, sorted by name. The API
 * pages by offset and gives no total, so pages are read a few at a time until
 * one comes back short.
 */
export async function listDistrictHotspots(
  http: HttpClient,
  districtId: string,
  signal?: AbortSignal,
): Promise<PlacedHotspot[]> {
  const { items } = await readAllPages(
    async (offset, limit) => {
      const query = new URLSearchParams({
        district_id: districtId,
        limit: String(limit),
        offset: String(offset),
      }).toString();
      return parseList(hotspotSchema, await http.get(`/hotspots?${query}`, { signal }), 'hotspots');
    },
    { pageSize: PAGE_SIZE, maxPages: MAX_PAGES, pagesAtOnce: PAGES_AT_ONCE },
  );
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The village names `hotspots` use, sorted, each once (ignoring case; the
 * first spelling met wins). Empty when none names a village.
 */
export function villageNames(hotspots: readonly Pick<PlacedHotspot, 'village'>[]): string[] {
  const villages = new Map<string, string>();
  for (const { village } of hotspots) {
    const key = village.toLowerCase();
    if (village && !villages.has(key)) villages.set(key, village);
  }
  return [...villages.values()].sort((a, b) => a.localeCompare(b));
}

export const STORE_TYPES = ['national', 'district'] as const;
export type StoreType = (typeof STORE_TYPES)[number];

const storeSchema = z.object({
  id: z.string().min(1),
  /** `jms` or `nms` for a national warehouse; the district's DHIS2 UID for a district store. */
  code: z.string(),
  name: z.string(),
  store_type: z.enum(STORE_TYPES),
  district_id: z.string().nullable(),
  district_name: z.string().nullable(),
});

/** A stock-holding point: a national warehouse or a district's store. */
export type Store = z.infer<typeof storeSchema>;

/** Every store: the national warehouses first, then district stores by name. */
export async function listStores(http: HttpClient, signal?: AbortSignal): Promise<Store[]> {
  return parseList(storeSchema, await http.get('/locations/stores', { signal }), 'stores');
}
