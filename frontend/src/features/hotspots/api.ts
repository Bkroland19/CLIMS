import { z } from 'zod';

import { optionalNumber, optionalText, parseList, type HttpClient } from '@/lib/api';

/** Ids are UUIDs from the Go API. */
const uuidSchema = z.string().min(1);
const optionalId = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const hotspotSchema = z.object({
  id: uuidSchema,
  name: optionalText,
  type: optionalText,
  village: optionalText,
  contact_person_name: optionalText,
  contact_person_telephone: optionalText,
  has_condom_dispenser: z
    .boolean()
    .nullish()
    .transform((value) => value ?? null),
  dispenser_condition: optionalText,
  latitude: optionalNumber,
  longitude: optionalNumber,
  comment: optionalText,
  status: optionalText,
  rejection_reason: optionalText,
  district_id: optionalId,
  submitted_by_id: optionalId,
  created_at: optionalText,
});

export type Hotspot = z.infer<typeof hotspotSchema>;

/** What a VHT sends to submit a newly identified hotspot. */
export interface HotspotSubmission {
  name: string;
  district_id: string;
  type: string | null;
  village: string | null;
  contact_person_name: string | null;
  contact_person_telephone: string | null;
  has_condom_dispenser: boolean | null;
  dispenser_condition: string | null;
  latitude: number | null;
  longitude: number | null;
  comment: string | null;
}

/** The DCFP's steps: verify then activate a submission, or reject it with a reason. */
export type HotspotAction = 'verify' | 'activate' | 'reject';

const eventSchema = z.object({
  id: uuidSchema,
  hot_spot_id: uuidSchema,
  action: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type HotspotEvent = z.infer<typeof eventSchema>;

const districtSchema = z.object({ id: uuidSchema, name: z.string() });

export type District = z.infer<typeof districtSchema>;

// shortcut: one page of the 100 most recent hotspots; page through the API when a district has more.
export async function listHotspots(http: HttpClient, signal?: AbortSignal): Promise<Hotspot[]> {
  return parseList(hotspotSchema, await http.get('/hotspots?limit=100', { signal }), 'hotspots');
}

export async function submitHotspot(http: HttpClient, input: HotspotSubmission): Promise<void> {
  await http.post('/hotspots', input);
}

export async function actOnHotspot(
  http: HttpClient,
  id: string,
  action: HotspotAction,
  reason?: string,
): Promise<void> {
  await http.post(
    `/hotspots/${encodeURIComponent(id)}/actions/${action}`,
    action === 'reject' ? { reason } : undefined,
  );
}

export async function listHotspotNotifications(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<HotspotEvent[]> {
  return parseList(
    eventSchema,
    await http.get('/hotspots/notifications', { signal }),
    'hotspot notifications',
  );
}

export async function listDistricts(http: HttpClient, signal?: AbortSignal): Promise<District[]> {
  return parseList(districtSchema, await http.get('/locations/districts', { signal }), 'districts');
}

export interface MappableHotspot extends Hotspot {
  latitude: number;
  longitude: number;
}

/**
 * The hotspots that can be drawn on a map. A record with missing or
 * out-of-range coordinates is left off rather than plotted at (0, 0), which is
 * a real place in the Gulf of Guinea.
 */
export function mappableHotspots(hotspots: readonly Hotspot[]): MappableHotspot[] {
  return hotspots.filter(
    (hotspot): hotspot is MappableHotspot =>
      hotspot.latitude !== null &&
      hotspot.longitude !== null &&
      Math.abs(hotspot.latitude) <= 90 &&
      Math.abs(hotspot.longitude) <= 180 &&
      !(hotspot.latitude === 0 && hotspot.longitude === 0),
  );
}
