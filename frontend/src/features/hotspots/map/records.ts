import { z } from 'zod';

import { optionalNumber, optionalText } from '@/lib/api';

import { isInUganda } from './uganda';

/*
 * Hotspots as the map needs them, read from the Go API's list
 * (`GET /hotspots`, `backend/internal/features/hotspots/model.go`):
 *
 *   { id, name, type, village, region, district, subcounty, latitude, longitude,
 *     has_condom_dispenser, dispenser_condition, status, review_status,
 *     submitted_by_id, contact_person: { id, name, phone_number }, created_at, updated_at }
 *
 * Converted legacy rows can lack almost any field (most have no subcounty, a third
 * no coordinates), and their `type` and `dispenser_condition` are free text. So
 * every field is optional here, and the free text is sorted into the few groups
 * a filter can offer (`venueOf`, `dispenserOf`).
 */

const placeSchema = z
  .object({ id: z.string().min(1), name: z.string().nullish() })
  .nullish()
  .transform((place) => (place ? { id: place.id, name: place.name?.trim() || null } : null));

export type MapPlace = NonNullable<z.output<typeof placeSchema>>;

export const REVIEW_STATUSES = ['active', 'submitted', 'rejected', 'deactivated'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number] | 'unknown';

export const DISPENSER_STATES = ['working', 'attention', 'unchecked', 'none', 'unknown'] as const;
export type DispenserState = (typeof DISPENSER_STATES)[number];

export const VENUE_KINDS = [
  'bar',
  'lodging',
  'eatery',
  'transport',
  'wellness',
  'market',
  'landing',
  'campus',
  'worksite',
  'other',
  'unclassified',
] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  active: 'Active',
  submitted: 'Submitted',
  rejected: 'Rejected',
  deactivated: 'Deactivated',
  unknown: 'Status not recorded',
};

/** What the review step means, for a legend or a tooltip. */
export const REVIEW_HINTS: Record<ReviewStatus, string> = {
  active: 'In use',
  submitted: 'Waiting for the DCFP',
  rejected: 'Sent back to the VHT',
  deactivated: 'Taken out of use',
  unknown: 'No review status',
};

export const DISPENSER_LABELS: Record<DispenserState, string> = {
  working: 'Dispenser working',
  attention: 'Dispenser needs repair',
  unchecked: 'Dispenser, condition unknown',
  none: 'No dispenser',
  unknown: 'Dispenser not recorded',
};

/** The same, short enough for a status chip in a list row. */
export const DISPENSER_SHORT_LABELS: Record<DispenserState, string> = {
  working: 'Working',
  attention: 'Needs repair',
  unchecked: 'Condition unknown',
  none: 'No dispenser',
  unknown: 'Not recorded',
};

export const DISPENSER_TONES = {
  working: 'positive',
  attention: 'caution',
  unchecked: 'info',
  none: 'negative',
  unknown: 'neutral',
} as const satisfies Record<DispenserState, string>;

export const VENUE_LABELS: Record<VenueKind, string> = {
  bar: 'Bar or club',
  lodging: 'Lodge or hotel',
  eatery: 'Restaurant or eatery',
  transport: 'Boda or taxi stage',
  wellness: 'Massage, spa or salon',
  market: 'Market or shop',
  landing: 'Landing site',
  campus: 'School or campus',
  worksite: 'Worksite',
  other: 'Other venue',
  unclassified: 'Type not recorded',
};

const hotspotSchema = z
  .object({
    id: z.string().min(1),
    name: optionalText,
    type: optionalText,
    village: optionalText,
    region: placeSchema,
    district: placeSchema,
    subcounty: placeSchema,
    latitude: optionalNumber,
    longitude: optionalNumber,
    has_condom_dispenser: z
      .boolean()
      .nullish()
      .transform((value) => value ?? null),
    dispenser_condition: optionalText,
    // `status` is active or inactive; `review_status` says which step. An earlier
    // API kept the step in `status`, so it is the fallback.
    status: optionalText,
    review_status: optionalText,
    contact_person: z
      .object({ name: optionalText, phone_number: optionalText })
      .nullish()
      .transform((person) => person ?? null),
    created_at: optionalText,
    updated_at: optionalText,
  })
  .transform((raw): MapHotspot => {
    const position = positionOf(raw.latitude, raw.longitude);
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      venue: venueOf(raw.type),
      village: raw.village,
      region: raw.region,
      district: raw.district,
      subcounty: raw.subcounty,
      position: position.check,
      latitude: position.check === 'placed' ? position.latitude : null,
      longitude: position.check === 'placed' ? position.longitude : null,
      recordedLatitude: raw.latitude,
      recordedLongitude: raw.longitude,
      review: reviewOf(raw.review_status ?? raw.status),
      hasDispenser: raw.has_condom_dispenser,
      dispenserCondition: raw.dispenser_condition,
      dispenser: dispenserOf(raw.has_condom_dispenser, raw.dispenser_condition),
      contactName: raw.contact_person?.name ?? null,
      contactPhone: raw.contact_person?.phone_number ?? null,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  });

export { hotspotSchema as mapHotspotSchema };

export interface MapHotspot {
  id: string;
  name: string | null;
  /** The type as recorded, e.g. "Guest Ho" (legacy rows were cut at 8 characters). */
  type: string | null;
  venue: VenueKind;
  village: string | null;
  region: MapPlace | null;
  district: MapPlace | null;
  subcounty: MapPlace | null;
  /** Whether the recorded position is drawn, and if not, why. */
  position: PositionCheck;
  /** Both `null` unless the position is `placed`. */
  latitude: number | null;
  longitude: number | null;
  /** The position as recorded, usable or not, so a wrong one can be shown and fixed. */
  recordedLatitude: number | null;
  recordedLongitude: number | null;
  review: ReviewStatus;
  hasDispenser: boolean | null;
  dispenserCondition: string | null;
  dispenser: DispenserState;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlacedHotspot extends MapHotspot {
  latitude: number;
  longitude: number;
}

export function isPlaced(hotspot: MapHotspot): hotspot is PlacedHotspot {
  return hotspot.latitude !== null && hotspot.longitude !== null;
}

/**
 * What a recorded position is worth. Only `placed` is drawn:
 *
 *   missing  no position, half of one, or (0, 0), which legacy rows use for "unknown"
 *   swapped  latitude and longitude the wrong way round: reversed, it is in Uganda
 *   outside  anywhere else outside Uganda: a phone emulator's default location in
 *            California, the corner of a web map (85.05, -180), another country
 */
export type PositionCheck = 'placed' | 'missing' | 'swapped' | 'outside';

export const POSITION_LABELS: Record<PositionCheck, string> = {
  placed: 'On the map',
  missing: 'No position',
  swapped: 'Swapped position',
  outside: 'Outside Uganda',
};

export function positionOf(
  latitude: number | null,
  longitude: number | null,
):
  | { check: 'placed'; latitude: number; longitude: number }
  | { check: Exclude<PositionCheck, 'placed'> } {
  if (latitude === null || longitude === null) return { check: 'missing' };
  if (latitude === 0 && longitude === 0) return { check: 'missing' };
  if (isInUganda(latitude, longitude)) return { check: 'placed', latitude, longitude };
  if (isInUganda(longitude, latitude)) return { check: 'swapped' };
  return { check: 'outside' };
}

export function reviewOf(value: string | null | undefined): ReviewStatus {
  const key = value?.trim().toLowerCase() ?? '';
  // The earlier API's "verified" step came before activation: still awaiting the DCFP.
  if (key === 'verified') return 'submitted';
  return (REVIEW_STATUSES as readonly string[]).includes(key) ? (key as ReviewStatus) : 'unknown';
}

const NEEDS_REPAIR = /\b(poor|bad|broken|damaged?|faulty|spoilt|spoiled|torn|empty|old|not)\b/;
const WORKING = /\b(good|ok|okay|fine|functional|functioning|working|new|excellent|fair)\b/;

/**
 * The dispenser's state from the yes/no answer and the free-text condition.
 * "Needs repair" is checked first, so "not working" is not read as working.
 */
export function dispenserOf(has: boolean | null, condition: string | null): DispenserState {
  if (has === false) return 'none';
  if (has === null) return 'unknown';
  const words = condition?.toLowerCase() ?? '';
  if (NEEDS_REPAIR.test(words)) return 'attention';
  if (WORKING.test(words)) return 'working';
  return 'unchecked';
}

// Ordered: a "Bar & lodge" is a bar first. Prefixes, because legacy types were cut short.
const VENUE_PATTERNS: readonly [VenueKind, RegExp][] = [
  ['bar', /\b(bar|pub|club|disco|night|lounge|beer|brew|wine|spirit)/],
  ['lodging', /\b(lodg|guest|hotel|motel|inn\b|hostel|rest ?house|accommodation)/],
  ['eatery', /\b(restaur|food|cafe|café|eat|kitchen|takeaway)/],
  ['transport', /\b(boda|taxi|stage|bus|truck|transport|car ?park)/],
  ['wellness', /\b(massage|spa\b|salon|sauna|parlou?r)/],
  ['market', /\b(market|shop|mall|trading|arcade|kiosk)/],
  ['landing', /\b(landing|fish|beach)/],
  ['campus', /\b(school|campus|universit|college|institut)/],
  ['worksite', /\b(mine|mining|factory|plantation|construction|farm|estate|quarry)/],
];

/** Legacy records used these as a type, but they say nothing about the venue. */
const NOT_A_VENUE = new Set(['new', 'old', 'vht', 'na', 'n/a', 'none', 'other', 'others']);

export function venueOf(type: string | null): VenueKind {
  const words = type?.trim().toLowerCase() ?? '';
  if (!words || NOT_A_VENUE.has(words)) return 'unclassified';
  return VENUE_PATTERNS.find(([, pattern]) => pattern.test(words))?.[0] ?? 'other';
}
