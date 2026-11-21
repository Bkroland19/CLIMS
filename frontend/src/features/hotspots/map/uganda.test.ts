import { describe, expect, it } from 'vitest';

import { BORDER_TOLERANCE_KM, UGANDA_BORDER, isInUganda, kmToBorder } from './uganda';

describe("Uganda's border", () => {
  it.each([
    ['Kampala', 0.3476, 32.5825],
    ['Gulu', 2.7746, 32.299],
    ['Kalangala, on a Lake Victoria island', -0.32, 32.29],
    ['Kasese, by Lake George', 0.183, 30.083],
    ['Kaabong, in the far north-east', 3.52, 34.12],
    ['Busia, on the Kenyan border', 0.466, 34.09],
  ])('takes in %s', (_, latitude, longitude) => {
    expect(isInUganda(latitude, longitude)).toBe(true);
  });

  it.each([
    ['Nairobi', -1.2676, 36.8079],
    ['Kisumu', -0.09, 34.77],
    ['Juba', 4.85, 31.6],
    ['Bunia', 1.56, 30.25],
    ['Goma', -1.68, 29.22],
    ['Kigali', -1.95, 30.06],
    ['Mountain View', 37.4221, -122.0839],
  ])('leaves out %s', (_, latitude, longitude) => {
    expect(isInUganda(latitude, longitude)).toBe(false);
  });

  it('allows a few kilometres past the drawn line, and no more', () => {
    // Just across the line at Busia (Kenya side) is within the tolerance.
    expect(kmToBorder(0.46, 34.11)).toBeLessThan(BORDER_TOLERANCE_KM);
    expect(isInUganda(0.46, 34.11)).toBe(true);
    expect(kmToBorder(0.46, 34.2)).toBeGreaterThan(BORDER_TOLERANCE_KM);
    expect(isInUganda(0.46, 34.2)).toBe(false);
  });

  it('is a closed ring of a sensible size', () => {
    expect(UGANDA_BORDER.length).toBeGreaterThan(100);
  });
});
