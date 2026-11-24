'use client';

import { MapPinOff } from 'lucide-react';
import { useState } from 'react';

import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { ColourBy } from './filters';
import {
  DISPENSER_SHORT_LABELS,
  DISPENSER_TONES,
  POSITION_LABELS,
  REVIEW_LABELS,
  VENUE_LABELS,
  type MapHotspot,
} from './records';

const PAGE = 50;

/** "Bar or club · Kajjansi · Wakiso": what kind of place, and where. */
export function placeLine(hotspot: MapHotspot): string {
  const kind = hotspot.venue === 'unclassified' ? null : VENUE_LABELS[hotspot.venue];
  return (
    [kind, hotspot.village, hotspot.district?.name].filter(Boolean).join(' · ') ||
    'Place not recorded'
  );
}

const coordinate = (value: number) => value.toFixed(4);

/** "Wakiso · 37.4221, -122.0839": where it should be, and what was recorded. */
export function recordedPosition(hotspot: MapHotspot): string {
  const { recordedLatitude: latitude, recordedLongitude: longitude } = hotspot;
  const recorded =
    latitude === null || longitude === null
      ? 'No position recorded'
      : `${coordinate(latitude)}, ${coordinate(longitude)}`;
  return [hotspot.district?.name, recorded].filter(Boolean).join(' · ');
}

export function hotspotName(hotspot: Pick<MapHotspot, 'name'>): string {
  return hotspot.name ?? 'Unnamed hotspot';
}

interface HotspotRowProps {
  hotspot: MapHotspot;
  colourBy: ColourBy;
  colourOf: (hotspot: MapHotspot) => string;
  showPosition?: boolean;
  onSelect: (id: string) => void;
  onHighlight: (id: string | null) => void;
  className?: string;
}

/**
 * One hotspot as a button: its colour, name, where it is, and a chip for any
 * state but the usual one. Pointing at it raises its pin on the map.
 */
export function HotspotRow({
  hotspot,
  colourBy,
  colourOf,
  showPosition = false,
  onSelect,
  onHighlight,
  className,
}: HotspotRowProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      onClick={() => {
        onSelect(hotspot.id);
      }}
      onMouseEnter={() => {
        onHighlight(hotspot.id);
      }}
      onFocus={() => {
        onHighlight(hotspot.id);
      }}
      onBlur={() => {
        onHighlight(null);
      }}
      className={cn(
        'hover:bg-muted/70 focus-visible:ring-ring flex h-auto min-h-7 w-full items-center justify-start gap-2.5 px-4 py-2 text-left whitespace-normal outline-none focus-visible:ring-2 focus-visible:ring-inset',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="ring-card size-2.5 shrink-0 rounded-full ring-2"
        style={{ backgroundColor: colourOf(hotspot) }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-sm font-medium',
            hotspot.name === null && 'text-muted-foreground italic',
          )}
        >
          {hotspotName(hotspot)}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {showPosition ? recordedPosition(hotspot) : placeLine(hotspot)}
        </span>
      </span>
      {showPosition ? (
        <StatusBadge
          status={POSITION_LABELS[hotspot.position]}
          tone={hotspot.position === 'missing' ? 'neutral' : 'caution'}
          className="shrink-0"
        />
      ) : colourBy === 'review' ? (
        // Most hotspots are active; only the exceptions carry a chip, so they stand out.
        hotspot.review === 'active' ? (
          <span className="sr-only">Active</span>
        ) : (
          <StatusBadge status={REVIEW_LABELS[hotspot.review]} className="shrink-0" />
        )
      ) : (
        <StatusBadge
          status={DISPENSER_SHORT_LABELS[hotspot.dispenser]}
          tone={DISPENSER_TONES[hotspot.dispenser]}
          className="shrink-0"
        />
      )}
    </Button>
  );
}

interface HotspotListProps {
  hotspots: readonly MapHotspot[];
  colourBy: ColourBy;
  colourOf: (hotspot: MapHotspot) => string;
  /** Shown when the list is empty. */
  emptyTitle: string;
  emptyHint: string;
  onSelect: (id: string) => void;
  onHighlight: (id: string | null) => void;
  /** Rows say why each hotspot is not on the map, with the position as recorded. */
  showPosition?: boolean;
  /** Starts the list from the top again when it changes. */
  resetKey: string;
}

/**
 * The hotspots as a list: the map's keyboard and screen-reader route, and the
 * quickest way to find one in a crowded area. Shows 50 at a time.
 */
export function HotspotList(props: HotspotListProps) {
  // Remounting on a new key resets how many rows are shown.
  return <HotspotRows key={props.resetKey} {...props} />;
}

function HotspotRows({
  hotspots,
  showPosition = false,
  colourBy,
  colourOf,
  emptyTitle,
  emptyHint,
  onSelect,
  onHighlight,
}: HotspotListProps) {
  const [limit, setLimit] = useState(PAGE);
  if (hotspots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-lg">
          <MapPinOff aria-hidden="true" className="size-4" />
        </span>
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground max-w-60 text-[0.8125rem]">{emptyHint}</p>
      </div>
    );
  }
  const shown = hotspots.slice(0, limit);
  return (
    <>
      <ul
        aria-labelledby="hotspot-panel-heading"
        className="flex flex-col py-1"
        onMouseLeave={() => {
          onHighlight(null);
        }}
      >
        {shown.map((hotspot) => (
          <li key={hotspot.id}>
            <HotspotRow
              hotspot={hotspot}
              colourBy={colourBy}
              colourOf={colourOf}
              showPosition={showPosition}
              onSelect={onSelect}
              onHighlight={onHighlight}
            />
          </li>
        ))}
      </ul>
      {hotspots.length > limit ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatNumber(limit)} of {formatNumber(hotspots.length)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLimit((current) => current + PAGE);
            }}
          >
            Show {formatNumber(Math.min(PAGE, hotspots.length - limit))} more
          </Button>
        </div>
      ) : null}
    </>
  );
}
