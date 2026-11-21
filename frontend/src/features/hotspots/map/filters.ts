import {
  DISPENSER_STATES,
  REVIEW_STATUSES,
  VENUE_KINDS,
  type DispenserState,
  type MapHotspot,
  type PlacedHotspot,
  type ReviewStatus,
  type VenueKind,
} from './records';

/*
 * The map's view state: what is drawn, how it is coloured and which hotspots are
 * left out. It lives in the page address, so a view can be shared and survives a
 * refresh. A filter that shows everything is left out of the address.
 */

export const MAP_VIEWS = ['clusters', 'heatmap', 'points'] as const;
export type MapView = (typeof MAP_VIEWS)[number];

export const COLOUR_MODES = ['review', 'dispenser'] as const;
export type ColourBy = (typeof COLOUR_MODES)[number];

export const ALL_REVIEW: readonly ReviewStatus[] = [...REVIEW_STATUSES, 'unknown'];

export interface MapFilters {
  /** The review statuses shown; `null` shows every one. */
  review: readonly ReviewStatus[] | null;
  dispenser: readonly DispenserState[] | null;
  venue: readonly VenueKind[] | null;
  regionId: string | null;
}

export interface MapState extends MapFilters {
  view: MapView;
  colourBy: ColourBy;
  /** The selected hotspot's id. */
  selectedId: string | null;
}

export const DEFAULT_MAP_STATE: MapState = {
  view: 'clusters',
  colourBy: 'review',
  review: null,
  dispenser: null,
  venue: null,
  regionId: null,
  selectedId: null,
};

function pickOne<Value extends string>(
  raw: string | null,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as Value) : fallback;
}

function pickMany<Value extends string>(
  raw: string | null,
  allowed: readonly Value[],
): readonly Value[] | null {
  if (raw === null) return null;
  const chosen = allowed.filter((value) => raw.split(',').includes(value));
  return chosen.length === allowed.length ? null : chosen;
}

export function parseMapState(params: URLSearchParams): MapState {
  return {
    view: pickOne(params.get('view'), MAP_VIEWS, 'clusters'),
    colourBy: pickOne(params.get('colour'), COLOUR_MODES, 'review'),
    review: pickMany(params.get('review'), ALL_REVIEW),
    dispenser: pickMany(params.get('dispenser'), DISPENSER_STATES),
    venue: pickMany(params.get('venue'), VENUE_KINDS),
    regionId: params.get('region') || null,
    selectedId: params.get('hotspot') || null,
  };
}

/** Writes `state` into `params`, leaving every other parameter (such as `district`) alone. */
export function writeMapState(params: URLSearchParams, state: MapState): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  };
  set('view', state.view === 'clusters' ? null : state.view);
  set('colour', state.colourBy === 'review' ? null : state.colourBy);
  set('review', state.review === null ? null : state.review.join(','));
  set('dispenser', state.dispenser === null ? null : state.dispenser.join(','));
  set('venue', state.venue === null ? null : state.venue.join(','));
  set('region', state.regionId);
  set('hotspot', state.selectedId);
  return next;
}

/** Flips one value in a shown-set; `null` stands for all of `every`. */
export function toggleShown<Value extends string>(
  shown: readonly Value[] | null,
  value: Value,
  every: readonly Value[],
): readonly Value[] | null {
  const current = shown ?? every;
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : every.filter((item) => item === value || current.includes(item));
  return next.length === every.length ? null : next;
}

export function activeFilterCount(filters: MapFilters): number {
  return [filters.review, filters.dispenser, filters.venue, filters.regionId].filter(
    (filter) => filter !== null,
  ).length;
}

export function matchesFilters(hotspot: MapHotspot, filters: MapFilters): boolean {
  return (
    (filters.review === null || filters.review.includes(hotspot.review)) &&
    (filters.dispenser === null || filters.dispenser.includes(hotspot.dispenser)) &&
    (filters.venue === null || filters.venue.includes(hotspot.venue)) &&
    (filters.regionId === null || hotspot.region?.id === filters.regionId)
  );
}

/** Lower-cased words to search: name, place, venue type and contact. */
export function searchTextOf(hotspot: MapHotspot): string {
  return [
    hotspot.name,
    hotspot.village,
    hotspot.subcounty?.name,
    hotspot.district?.name,
    hotspot.type,
    hotspot.contactName,
    hotspot.contactPhone,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Every word of the query must appear somewhere in the hotspot's text. */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => text.includes(word));
}

export function countBy<Key extends string>(
  hotspots: readonly MapHotspot[],
  keyOf: (hotspot: MapHotspot) => Key,
): Map<Key, number> {
  const counts = new Map<Key, number>();
  for (const hotspot of hotspots) {
    const key = keyOf(hotspot);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function isWithin(hotspot: PlacedHotspot, bounds: Bounds): boolean {
  return (
    hotspot.latitude >= bounds.south &&
    hotspot.latitude <= bounds.north &&
    hotspot.longitude >= bounds.west &&
    hotspot.longitude <= bounds.east
  );
}

export function boundsOf(hotspots: readonly PlacedHotspot[]): Bounds | null {
  if (hotspots.length === 0) return null;
  const bounds = { west: 180, south: 90, east: -180, north: -90 };
  for (const { latitude, longitude } of hotspots) {
    bounds.west = Math.min(bounds.west, longitude);
    bounds.east = Math.max(bounds.east, longitude);
    bounds.south = Math.min(bounds.south, latitude);
    bounds.north = Math.max(bounds.north, latitude);
  }
  return bounds;
}

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Neighbour {
  hotspot: PlacedHotspot;
  km: number;
}

/** The `count` hotspots closest to `target`, nearest first, leaving the target out. */
export function nearestTo(
  target: PlacedHotspot,
  candidates: readonly PlacedHotspot[],
  count: number,
): Neighbour[] {
  const nearest: Neighbour[] = [];
  for (const hotspot of candidates) {
    if (hotspot.id === target.id) continue;
    const km = distanceKm(target, hotspot);
    const furthest = nearest.at(-1);
    if (nearest.length < count || (furthest && km < furthest.km)) {
      nearest.push({ hotspot, km });
      nearest.sort((a, b) => a.km - b.km);
      if (nearest.length > count) nearest.pop();
    }
  }
  return nearest;
}

/** "Same place", "350 m", "4.2 km" or "38 km". */
export function formatDistance(km: number): string {
  if (km < 0.01) return 'Same place';
  if (km < 1) return `${String(Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${String(Math.round(km))} km`;
}

// One collator for every comparison: `localeCompare` with options builds a new one
// each call, which made sorting twelve thousand names take seconds.
const nameOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Sorts by name, unnamed last, so a list reads like a directory. */
export function byName(a: MapHotspot, b: MapHotspot): number {
  if (a.name === null) return b.name === null ? 0 : 1;
  if (b.name === null) return -1;
  return nameOrder.compare(a.name, b.name);
}
