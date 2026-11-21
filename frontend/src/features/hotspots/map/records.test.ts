import { describe, expect, it } from 'vitest';

import {
  coordinatesOf,
  dispenserOf,
  isPlaced,
  mapHotspotSchema,
  reviewOf,
  venueOf,
} from './records';

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
      latitude: 0.3295,
      longitude: 32.6016,
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

describe('coordinatesOf', () => {
  it.each([
    [0.3, 32.5, { latitude: 0.3, longitude: 32.5 }],
    [null, 32.5, null],
    [0, 0, null],
    [91, 32, null],
    [1, -181, null],
  ])('(%s, %s)', (latitude, longitude, expected) => {
    expect(coordinatesOf(latitude, longitude)).toEqual(expected);
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
