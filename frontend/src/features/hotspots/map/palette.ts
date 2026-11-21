import { useSyncExternalStore } from 'react';

import type { ColourBy } from './filters';
import {
  DISPENSER_LABELS,
  DISPENSER_STATES,
  REVIEW_LABELS,
  REVIEW_STATUSES,
  type DispenserState,
  type ReviewStatus,
} from './records';

/*
 * The map draws with WebGL, which cannot read CSS, so its colours are read from
 * the design tokens on <html> and read again when the theme class changes.
 *
 * Markers are fills, so active (in use) and a working dispenser take `primary`,
 * the system's marker green. Caution, negative and neutral follow the status
 * chips. Colour is never the only cue: the legend, the hover label, the list and
 * the detail panel all say the status in words.
 */

export interface Category<Key extends string> {
  key: Key;
  label: string;
  /** A CSS custom property on <html>. */
  token: string;
}

const REVIEW_TOKENS: Record<ReviewStatus, string> = {
  active: '--primary',
  submitted: '--warning',
  rejected: '--destructive',
  deactivated: '--role-system',
  unknown: '--muted-foreground',
};

const DISPENSER_TOKENS: Record<DispenserState, string> = {
  working: '--primary',
  attention: '--warning',
  unchecked: '--info',
  none: '--destructive',
  unknown: '--role-system',
};

export const REVIEW_CATEGORIES: readonly Category<ReviewStatus>[] = [
  ...REVIEW_STATUSES,
  'unknown' as const,
].map((key) => ({ key, label: REVIEW_LABELS[key], token: REVIEW_TOKENS[key] }));

export const DISPENSER_CATEGORIES: readonly Category<DispenserState>[] = DISPENSER_STATES.map(
  (key) => ({ key, label: DISPENSER_LABELS[key], token: DISPENSER_TOKENS[key] }),
);

export function categoriesFor(colourBy: ColourBy): readonly Category<string>[] {
  return colourBy === 'review' ? REVIEW_CATEGORIES : DISPENSER_CATEGORIES;
}

/** The surface and ink colours the map draws with, besides the categories. */
const SURFACE_TOKENS = {
  background: '--background',
  card: '--card',
  foreground: '--foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
  heat1: '--chart-1',
  heat2: '--chart-3',
  heat3: '--chart-4',
  heat4: '--chart-5',
} as const;

export type MapPalette = Record<keyof typeof SURFACE_TOKENS, string> & {
  /** Keyed by token, e.g. `--primary`. */
  tokens: Record<string, string>;
};

const ALL_TOKENS = [
  ...new Set([
    ...Object.values(REVIEW_TOKENS),
    ...Object.values(DISPENSER_TOKENS),
    ...Object.values(SURFACE_TOKENS),
  ]),
];

function readPalette(): MapPalette {
  const style = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const token of ALL_TOKENS) {
    tokens[token] = style.getPropertyValue(token).trim() || '#808080';
  }
  const surface = Object.fromEntries(
    Object.entries(SURFACE_TOKENS).map(([name, token]) => [name, tokens[token] ?? '#808080']),
  ) as Record<keyof typeof SURFACE_TOKENS, string>;
  return { ...surface, tokens };
}

let cached: { key: string; palette: MapPalette } | null = null;

function snapshot(): MapPalette {
  const key = document.documentElement.className;
  if (cached?.key !== key) cached = { key, palette: readPalette() };
  return cached.palette;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => {
    observer.disconnect();
  };
}

/** The design tokens as colours, kept current when the theme changes. Browser only. */
export function useMapPalette(): MapPalette {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Whether the dark theme is on; the base map is dimmed to match. */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

export function colourOf(palette: MapPalette, category: Category<string>): string {
  return palette.tokens[category.token] ?? palette.mutedForeground;
}
