import { describe, expect, it } from 'vitest';

import { dispenserOf, isPlaced, mapHotspotSchema, positionOf, reviewOf, venueOf } from './records';

const wire = {
  id: '6f1e2c50-9d8a-4f3b-8c1e-2b7a9d0c4e11',
  name: ' Lake view bar ',
  type: 'Bar & Lo',
  village: 'Seja',
  region: { id: 'r1', name: 'Central' },
  district: { id: 'd1', name: 'Wakiso' },
  subcounty: null,
  latitude: 0.3295,
  longitude: '32.6016',
  has_condom_dispenser: true,
  dispenser_condition: 'Good',
  status: 'inactive',
  review_status: 'deactivated',
  submitted_by_id: null,
  contact_person: { id: 'c1', name: 'Okello James', phone_number: '+256772000000' },
  created_at: '2026-01-02T10:00:00Z',
  updated_at: '2026-02-03T10:00:00Z',
};

describe('mapHotspotSchema', () => {
  it('reads the Go API list item', () => {
    expect(mapHotspotSchema.parse(wire)).toEqual({
      id: wire.id,
      name: 'Lake view bar',
      type: 'Bar & Lo',
      venue: 'bar',
      village: 'Seja',
      region: { id: 'r1', name: 'Central' },
      district: { id: 'd1', name: 'Wakiso' },
      subcounty: null,
      position: 'placed',
      latitude: 0.3295,
      longitude: 32.6016,
      recordedLatitude: 0.3295,
      recordedLongitude: 32.6016,
      review: 'deactivated',
      hasDispenser: true,
      dispenserCondition: 'Good',
      dispenser: 'working',
      contactName: 'Okello James',
      contactPhone: '+256772000000',
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-02-03T10:00:00Z',
    });
  });

  it('copes with a converted legacy row that has almost nothing', () => {
    const hotspot = mapHotspotSchema.parse({ id: 'legacy-1', status: 'active' });
    expect(hotspot).toMatchObject({
      name: null,
      venue: 'unclassified',
      district: null,
      latitude: null,
      longitude: null,
      review: 'active',
      dispenser: 'unknown',
      contactName: null,
    });
    expect(isPlaced(hotspot)).toBe(false);
  });

  it('leaves a hotspot at (0, 0) off the map', () => {
    const hotspot = mapHotspotSchema.parse({ ...wire, latitude: 0, longitude: 0 });
    expect(hotspot.latitude).toBeNull();
    expect(isPlaced(hotspot)).toBe(false);
  });
});

describe('positionOf', () => {
  it.each([
    // In Uganda, including a Lake Victoria island and border towns.
    [0.3295, 32.6016, 'placed'],
    [-0.32, 32.29, 'placed'],
    [0.4604, 34.1045, 'placed'],
    [-1.0, 31.42, 'placed'],
    // Nothing usable recorded.
    [null, 32.5, 'missing'],
    [37.4221, null, 'missing'],
    [0, 0, 'missing'],
    // Latitude and longitude the wrong way round (seen in legacy rows).
    [32.4, 0.09, 'swapped'],
    [32.3454, 0.2343, 'swapped'],
    // Elsewhere: an emulator's default location, a web map's corner, Nairobi, Juba, Goma.
    [37.4221, -122.0839, 'outside'],
    [85.0511, -180, 'outside'],
    [-1.2676, 36.8079, 'outside'],
    [4.85, 31.6, 'outside'],
    [-1.68, 29.22, 'outside'],
    [32.5346, 32.4648, 'outside'],
    [91, 32, 'outside'],
  ] as const)('(%s, %s) is %s', (latitude, longitude, expected) => {
    expect(positionOf(latitude, longitude).check).toBe(expected);
  });

  it('keeps the recorded position of a hotspot it leaves off the map', () => {
    const hotspot = mapHotspotSchema.parse({ id: 'x', latitude: 37.4221, longitude: -122.0839 });
    expect(hotspot).toMatchObject({
      position: 'outside',
      latitude: null,
      longitude: null,
      recordedLatitude: 37.4221,
      recordedLongitude: -122.0839,
    });
    expect(isPlaced(hotspot)).toBe(false);
  });
});

describe('reviewOf', () => {
  it.each([
    ['active', 'active'],
    [' Submitted ', 'submitted'],
    ['verified', 'submitted'],
    ['rejected', 'rejected'],
    ['deactivated', 'deactivated'],
    ['inactive', 'unknown'],
    [null, 'unknown'],
  ])('%s is %s', (value, expected) => {
    expect(reviewOf(value)).toBe(expected);
  });
});

describe('dispenserOf', () => {
  it.each([
    [true, 'Good', 'working'],
    [true, 'In good condition', 'working'],
    [true, 'functional', 'working'],
    [true, 'Poor', 'attention'],
    [true, 'not working', 'attention'],
    [true, 'Broken', 'attention'],
    [true, null, 'unchecked'],
    [true, 'blue', 'unchecked'],
    [false, 'Good', 'none'],
    [null, 'Good', 'unknown'],
  ] as const)('%s with "%s" is %s', (has, condition, expected) => {
    expect(dispenserOf(has, condition)).toBe(expected);
  });
});

describe('venueOf', () => {
  it.each([
    ['Bar', 'bar'],
    ['Bar and ', 'bar'],
    ['Guest Ho', 'lodging'],
    ['lodge', 'lodging'],
    ['Hotel', 'lodging'],
    ['Restaura', 'eatery'],
    ['Boda Sta', 'transport'],
    ['Massage', 'wellness'],
    ['Market', 'market'],
    ['Landing site', 'landing'],
    ['University hostel', 'lodging'],
    ['Gardens', 'other'],
    ['New', 'unclassified'],
    ['Old', 'unclassified'],
    ['  ', 'unclassified'],
    [null, 'unclassified'],
  ])('%s is %s', (type, expected) => {
    expect(venueOf(type)).toBe(expected);
  });
});
