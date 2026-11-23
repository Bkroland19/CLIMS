import { describe, expect, it } from 'vitest';

import { inkFor, parsePinImageId, pinImageId } from './pins';

describe('pins', () => {
  it.each([
    // The marker green and the bright dark-theme colours take dark ink...
    ['#45ba50', '#0c0d0f'],
    ['#ff8918', '#0c0d0f'],
    ['#00b5eb', '#0c0d0f'],
    // ...the deep light-theme status colours take white.
    ['#b71c1c', '#ffffff'],
    ['#a84c06', '#ffffff'],
    ['#0a6a9b', '#ffffff'],
    ['not a colour', '#ffffff'],
  ])('draws the glyph on %s in %s', (fill, ink) => {
    expect(inkFor(fill)).toBe(ink);
  });

  it('names an image by what it shows, and reads the name back', () => {
    const id = pinImageId('#45ba50', 'bar');
    expect(id).toBe('pin|#45ba50|bar');
    expect(parsePinImageId(id)).toEqual({ fill: '#45ba50', venue: 'bar' });
    expect(parsePinImageId('cluster|1')).toBeNull();
  });
});
