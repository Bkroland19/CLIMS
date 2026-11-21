import { describe, expect, it } from 'vitest';

import {
  ALL_REVIEW,
  DEFAULT_MAP_STATE,
  activeFilterCount,
  boundsOf,
  byName,
  countBy,
  distanceKm,
  formatDistance,
  isWithin,
  matchesFilters,
  matchesQuery,
  nearestTo,
  parseMapState,
  searchTextOf,
  toggleShown,
  writeMapState,
} from './filters';
import type { MapHotspot, PlacedHotspot } from './records';

function hotspot(fields: Partial<MapHotspot> = {}): PlacedHotspot {
  return {
    id: 'h1',
    name: 'Lake view bar',
    type: 'Bar',
    venue: 'bar',
    village: 'Seja',
    region: { id: 'r1', name: 'Central' },
    district: { id: 'd1', name: 'Wakiso' },
    subcounty: null,
    latitude: 0.33,
    longitude: 32.6,
    review: 'active',
    hasDispenser: true,
    dispenserCondition: 'Good',
    dispenser: 'working',
    contactName: 'Okello James',
    contactPhone: '+256772000000',
    createdAt: null,
    updatedAt: null,
    ...fields,
  } as PlacedHotspot;
}

describe('map state in the address', () => {
  it('reads defaults from an empty address', () => {
    expect(parseMapState(new URLSearchParams())).toEqual(DEFAULT_MAP_STATE);
  });

  it('round-trips a view, keeping parameters it does not own', () => {
    const state = {
      ...DEFAULT_MAP_STATE,
      view: 'heatmap' as const,
      colourBy: 'dispenser' as const,
      review: ['submitted' as const],
      venue: ['bar' as const, 'lodging' as const],
      regionId: 'r1',
      selectedId: 'h1',
    };
    const params = writeMapState(new URLSearchParams('district=Wakiso'), state);
    expect(params.get('district')).toBe('Wakiso');
    expect(params.get('review')).toBe('submitted');
    expect(parseMapState(params)).toEqual(state);
  });

  it('drops values it does not know and treats a full set as no filter', () => {
    const state = parseMapState(
      new URLSearchParams(`view=globe&colour=x&review=${ALL_REVIEW.join(',')}&venue=bar,spaceship`),
    );
    expect(state.view).toBe('clusters');
    expect(state.colourBy).toBe('review');
    expect(state.review).toBeNull();
    expect(state.venue).toEqual(['bar']);
  });

  it('leaves defaults out of the address', () => {
    expect(writeMapState(new URLSearchParams(), DEFAULT_MAP_STATE).toString()).toBe('');
  });
});

describe('toggleShown', () => {
  const every = ['a', 'b', 'c'] as const;
  it('hides one choice from "all", then shows it again', () => {
    const hidden = toggleShown(null, 'b', every);
    expect(hidden).toEqual(['a', 'c']);
    expect(toggleShown(hidden, 'b', every)).toBeNull();
  });

  it('keeps the canonical order', () => {
    expect(toggleShown(['c'], 'a', every)).toEqual(['a', 'c']);
  });
});

describe('matching', () => {
  it('applies every filter together', () => {
    const filters = { review: ['active' as const], dispenser: null, venue: null, regionId: 'r1' };
    expect(matchesFilters(hotspot(), filters)).toBe(true);
    expect(matchesFilters(hotspot({ review: 'rejected' }), filters)).toBe(false);
    expect(matchesFilters(hotspot({ region: null }), filters)).toBe(false);
    expect(activeFilterCount(filters)).toBe(2);
  });

  it('finds every word of a search anywhere in the hotspot', () => {
    const text = searchTextOf(hotspot());
    expect(matchesQuery(text, 'okello  wakiso')).toBe(true);
    expect(matchesQuery(text, 'LAKE seja')).toBe(true);
    expect(matchesQuery(text, 'lake gulu')).toBe(false);
    expect(matchesQuery(text, '   ')).toBe(true);
  });

  it('counts by a key', () => {
    const counts = countBy(
      [hotspot(), hotspot({ review: 'submitted' }), hotspot()],
      (h) => h.review,
    );
    expect(Object.fromEntries(counts)).toEqual({ active: 2, submitted: 1 });
  });
});

describe('geometry', () => {
  const kampala = hotspot({ id: 'k', latitude: 0.3476, longitude: 32.5825 });
  const entebbe = hotspot({ id: 'e', latitude: 0.0512, longitude: 32.4637 });
  const jinja = hotspot({ id: 'j', latitude: 0.4244, longitude: 33.2042 });

  it('measures great-circle distance', () => {
    expect(distanceKm(kampala, entebbe)).toBeCloseTo(35.5, 0);
  });

  it('finds the nearest hotspots, nearest first, without the hotspot itself', () => {
    const near = nearestTo(kampala, [jinja, kampala, entebbe], 5);
    expect(near.map(({ hotspot: h }) => h.id)).toEqual(['e', 'j']);
    expect(nearestTo(kampala, [jinja, entebbe], 1).map(({ hotspot: h }) => h.id)).toEqual(['e']);
  });

  it('frames a set and tests membership', () => {
    const bounds = boundsOf([kampala, entebbe, jinja]);
    expect(bounds).toEqual({ west: 32.4637, south: 0.0512, east: 33.2042, north: 0.4244 });
    expect(boundsOf([])).toBeNull();
    expect(isWithin(kampala, { west: 32, south: 0, east: 33, north: 1 })).toBe(true);
    expect(isWithin(jinja, { west: 32, south: 0, east: 33, north: 1 })).toBe(false);
  });

  it.each([
    [0.005, 'Same place'],
    [0.344, '340 m'],
    [4.25, '4.3 km'],
    [38.4, '38 km'],
  ])('writes %s km as %s', (km, expected) => {
    expect(formatDistance(km)).toBe(expected);
  });
});

describe('byName', () => {
  it('sorts like a directory, numbers in order, unnamed last', () => {
    const names = ['bar 10', null, 'Bar 2', 'akello lodge'].map((name, index) =>
      hotspot({ id: String(index), name }),
    );
    expect(names.sort(byName).map(({ name }) => name)).toEqual([
      'akello lodge',
      'Bar 2',
      'bar 10',
      null,
    ]);
  });
});
