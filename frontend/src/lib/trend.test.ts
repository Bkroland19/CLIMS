import { describe, expect, it } from 'vitest';

import { sparklineGeometry, trendChange } from './trend';

describe('trendChange', () => {
  it('compares the last two points', () => {
    expect(trendChange([3, 5, 4, 7])).toEqual({ delta: 3, direction: 'up', meaning: 'neutral' });
    expect(trendChange([3, 5, 4, 1])).toEqual({ delta: -3, direction: 'down', meaning: 'neutral' });
  });

  it.each([
    { series: [1, 4], good: 'up', meaning: 'good' },
    { series: [4, 1], good: 'up', meaning: 'bad' },
    { series: [4, 1], good: 'down', meaning: 'good' },
    { series: [1, 4], good: 'down', meaning: 'bad' },
    { series: [2, 2], good: 'up', meaning: 'neutral' },
  ] as const)('a move in $series is $meaning when $good is good', ({ series, good, meaning }) => {
    expect(trendChange(series, good)?.meaning).toBe(meaning);
  });

  it('marks no change as flat', () => {
    expect(trendChange([5, 5], 'up')).toEqual({ delta: 0, direction: 'flat', meaning: 'neutral' });
  });

  it('ignores points that are not numbers', () => {
    expect(trendChange([2, Number.NaN, 6, Number.POSITIVE_INFINITY])?.delta).toBe(4);
  });

  it.each([[[]], [[4]], [[Number.NaN, 3]]])('needs two points, so %j gives null', (series) => {
    expect(trendChange(series)).toBeNull();
  });
});

describe('sparklineGeometry', () => {
  it('runs from the left edge to the right edge, lowest value at the bottom', () => {
    const geometry = sparklineGeometry([0, 10], 80, 30);
    // Bottom padding 4, top padding 6.
    expect(geometry?.line).toBe('M0,26 L80,6');
    expect(geometry?.end).toEqual({ x: 80, y: 6 });
  });

  it('closes the area down to the baseline', () => {
    expect(sparklineGeometry([0, 10], 80, 30)?.area).toBe('M0,26 L80,6 L80,30 L0,30 Z');
  });

  it('draws a flat series along the bottom', () => {
    expect(sparklineGeometry([3, 3, 3], 40, 30)?.line).toBe('M0,26 L20,26 L40,26');
  });

  it('returns null with fewer than two points', () => {
    expect(sparklineGeometry([7], 80, 30)).toBeNull();
  });
});
