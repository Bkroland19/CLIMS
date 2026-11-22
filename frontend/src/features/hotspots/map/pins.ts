import type { VenueKind } from './records';

/*
 * A single hotspot is drawn as a pin: a teardrop in its category colour, white
 * edged, with a glyph for the kind of venue inside (a beer for a bar, a bed for
 * a lodge, a motorbike for a boda stage). A venue with no recognisable type gets
 * a plain dot. The pin's tip sits on the recorded position.
 *
 * MapLibre needs bitmaps, so pins are drawn on a canvas the first time the map
 * asks for one (`styleimagemissing`). Glyph outlines are lucide icons (ISC
 * licence), copied as path data on a 24-unit grid so they can be drawn with
 * Path2D without the React components.
 */

const GLYPHS: Partial<Record<VenueKind, readonly string[]>> = {
  // lucide `beer`
  bar: [
    'M17 11h1a3 3 0 0 1 0 6h-1',
    'M9 12v6',
    'M13 12v6',
    'M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z',
    'M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8',
  ],
  // lucide `bed-double`
  lodging: [
    'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8',
    'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4',
    'M12 4v6',
    'M2 18h20',
  ],
  // lucide `utensils`
  eatery: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
  // lucide `motorbike`
  transport: [
    'm18 14-1-3',
    'm3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81',
    'M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5',
    'M16 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M2 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  ],
  // lucide `sparkles`
  wellness: [
    'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
    'M20 2v4',
    'M22 4h-4',
    'M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  ],
  // lucide `store`
  market: [
    'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5',
    'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244',
    'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05',
  ],
  // lucide `fish`
  landing: [
    'M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z',
    'M18 12v.5',
    'M16 17.93a9.77 9.77 0 0 1 0-11.86',
    'M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33',
    'M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4',
    'm16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98',
  ],
  // lucide `graduation-cap`
  campus: [
    'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
    'M22 10v6',
    'M6 12.5V16a6 3 0 0 0 12 0v-3.5',
  ],
  // lucide `hard-hat`
  worksite: [
    'M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5',
    'M14 6a6 6 0 0 1 6 6v3',
    'M4 15v-3a6 6 0 0 1 6-6',
    'M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z',
  ],
};

/** lucide `house`, for the "Show all of Uganda" control. */
export const HOME_ICON_PATHS: readonly string[] = [
  'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
  'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
];

/** The pin's size in CSS pixels, without its shadow margin. */
export const PIN_WIDTH = 30;
export const PIN_HEIGHT = 38;
/** Room around the pin for its shadow. */
const MARGIN = 3;
/** Teardrop on a 30 × 38 grid: a circle of radius 12 at (15, 14.5), tapering to the tip at (15, 37). */
const PIN_PATH = 'M15 37C13.4 34.2 3 25.6 3 14.5A12 12 0 0 1 27 14.5C27 25.6 16.6 34.2 15 37Z';
const HEAD = { x: 15, y: 14.5 };
const GLYPH_SIZE = 13;

/**
 * The image is anchored at its bottom edge; this moves it down so the tip, not the
 * shadow margin under it, sits on the position (CSS pixels, scaled with the icon).
 */
export const PIN_TIP_SHIFT = PIN_HEIGHT + 2 * MARGIN - (37 + MARGIN - 1);

const DARK_INK = '#0c0d0f';
const LIGHT_INK = '#ffffff';

function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** White or near-black, whichever stands out more on `fill` (WCAG contrast). */
export function inkFor(fill: string): string {
  const l = luminance(fill);
  if (l === null) return LIGHT_INK;
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / ((luminance(DARK_INK) ?? 0) + 0.05);
  return onDark > onWhite ? DARK_INK : LIGHT_INK;
}

/** The image name for a pin, which says everything needed to draw it. */
export function pinImageId(fill: string, venue: VenueKind): string {
  return `pin|${fill}|${venue}`;
}

export function parsePinImageId(id: string): { fill: string; venue: VenueKind } | null {
  const [kind, fill, venue] = id.split('|');
  if (kind !== 'pin' || !fill || !venue) return null;
  return { fill, venue: venue as VenueKind };
}

/** Draws a pin at `ratio` device pixels per CSS pixel, for `map.addImage(id, data, { pixelRatio })`. */
export function drawPin(fill: string, venue: VenueKind, ratio = 2): ImageData | null {
  const width = (PIN_WIDTH + MARGIN * 2) * ratio;
  const height = (PIN_HEIGHT + MARGIN * 2) * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.scale(ratio, ratio);
  context.translate(MARGIN, MARGIN - 1);

  const pin = new Path2D(PIN_PATH);
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.32)';
  context.shadowBlur = 3;
  context.shadowOffsetY = 1;
  context.fillStyle = fill;
  context.fill(pin);
  context.restore();
  // A white edge keeps neighbouring pins apart on any base map.
  context.lineWidth = 1.75;
  context.strokeStyle = '#ffffff';
  context.stroke(pin);

  const ink = inkFor(fill);
  const glyph = GLYPHS[venue];
  if (glyph) {
    context.save();
    context.translate(HEAD.x - GLYPH_SIZE / 2, HEAD.y - GLYPH_SIZE / 2);
    context.scale(GLYPH_SIZE / 24, GLYPH_SIZE / 24);
    context.strokeStyle = ink;
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const d of glyph) context.stroke(new Path2D(d));
    context.restore();
  } else {
    context.beginPath();
    context.arc(HEAD.x, HEAD.y, 4.25, 0, Math.PI * 2);
    context.fillStyle = ink;
    context.fill();
  }
  return context.getImageData(0, 0, width, height);
}
