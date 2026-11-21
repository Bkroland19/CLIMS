import {
  BedDouble,
  Beer,
  Circle,
  Fish,
  GraduationCap,
  HardHat,
  Motorbike,
  Sparkles,
  Store,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

import type { VenueKind } from './records';

/** The glyph each venue's pin carries on the map (`pins.ts`), as an icon for menus and keys. */
export const VENUE_ICONS: Record<VenueKind, LucideIcon> = {
  bar: Beer,
  lodging: BedDouble,
  eatery: Utensils,
  transport: Motorbike,
  wellness: Sparkles,
  market: Store,
  landing: Fish,
  campus: GraduationCap,
  worksite: HardHat,
  // Both draw a plain dot inside the pin.
  other: Circle,
  unclassified: Circle,
};
