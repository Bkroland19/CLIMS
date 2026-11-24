import { describe, expect, it } from 'vitest';

import {
  clusterLabel,
  clusterSize,
  clusterSummary,
  compactCount,
  createClusterElement,
} from './clusterMarker';
import { REVIEW_CATEGORIES } from './palette';

const [active, submitted, rejected] = REVIEW_CATEGORIES;
const slices = [
  { category: active!, colour: '#45ba50', count: 280 },
  { category: submitted!, colour: '#a84c06', count: 32 },
  { category: rejected!, colour: '#b71c1c', count: 0 },
];

describe('cluster rings', () => {
  it.each([
    [7, '7'],
    [999, '999'],
    [1000, '1k'],
    [1249, '1.2k'],
    [18_001, '18k'],
  ])('shortens %s to %s', (count, expected) => {
    expect(compactCount(count)).toBe(expected);
  });

  it('sums itself up for the hover label, leaving out empty categories', () => {
    expect(clusterSummary(312, slices)).toEqual({
      title: '312 hotspots',
      detail: '280 active · 32 submitted',
    });
  });

  it('grows by order of magnitude', () => {
    expect([5, 50, 500, 5000].map(clusterSize)).toEqual([30, 36, 44, 52]);
  });

  it('says what is in the cluster in words, leaving out empty categories', () => {
    expect(clusterLabel(312, slices)).toBe(
      '312 hotspots: 280 active, 32 submitted. Zoom in to see them.',
    );
  });

  it('draws a button with one arc per category present', () => {
    const element = createClusterElement(312, slices, {
      card: '#fff',
      foreground: '#000',
      border: '#ddd',
    });
    expect(element.tagName).toBe('BUTTON');
    expect(element.type).toBe('button');
    expect(element.getAttribute('aria-label')).toMatch(/^312 hotspots/);
    expect(element.dataset.size).toBe('large');
    expect(element.textContent).toBe('312');
    // The disc, then two arcs.
    expect(element.querySelectorAll('circle')).toHaveLength(3);
  });
});
