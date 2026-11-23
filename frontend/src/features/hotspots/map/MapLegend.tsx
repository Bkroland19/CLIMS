'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { ColourBy } from './filters';
import { Segmented, type FacetOption } from './MapToolbar';

const COLOUR_OPTIONS: readonly { value: ColourBy; label: string }[] = [
  { value: 'review', label: 'Status' },
  { value: 'dispenser', label: 'Dispenser' },
];

interface MapLegendProps<Key extends string> {
  colourBy: ColourBy;
  onColourByChange: (colourBy: ColourBy) => void;
  options: readonly FacetOption<Key>[];
  shown: readonly Key[] | null;
  onToggle: (key: Key) => void;
  className?: string;
}

/**
 * What the colours mean, with how many hotspots each covers. Its tabs choose
 * what the colours show; each entry switches its hotspots on and off, so the key
 * doubles as the quickest filter. Folds away on a small screen.
 */
export function MapLegend<Key extends string>({
  colourBy,
  onColourByChange,
  options,
  shown,
  onToggle,
  className,
}: MapLegendProps<Key>) {
  // Open on a wide screen; folded on a phone, where it would cover the hotspots.
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  const visible = options.filter((option) => option.count > 0 || shown?.includes(option.key));
  return (
    <section
      aria-label="Map key"
      className={cn(
        'bg-card/95 pointer-events-auto max-w-[calc(100%-1.5rem)] rounded-lg border shadow-xs backdrop-blur-sm',
        className,
        // Folded, it shrinks to its tabs and leaves the scale and credits clear.
        !open && 'w-auto!',
      )}
    >
      <div className="flex items-center justify-between gap-1 p-1">
        <Segmented
          label="Colour hotspots by"
          value={colourBy}
          options={COLOUR_OPTIONS}
          onChange={onColourByChange}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Fold the map key' : 'Open the map key'}
          onClick={() => {
            setOpen((current) => !current);
          }}
          className="text-muted-foreground"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', !open && 'rotate-180')}
          />
        </Button>
      </div>
      {open ? (
        <ul className="flex flex-col gap-px px-1 pb-1">
          {visible.length === 0 ? (
            <li className="text-muted-foreground px-1.5 py-1 text-xs">Nothing on the map yet</li>
          ) : null}
          {visible.map((option) => {
            const on = shown === null || shown.includes(option.key);
            return (
              <li key={option.key}>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    onToggle(option.key);
                  }}
                  className={cn(
                    'w-full justify-start gap-2 px-1.5 text-left text-xs',
                    !on && 'text-muted-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2.5 shrink-0 rounded-full border',
                      on ? 'border-card' : 'border-muted-foreground bg-transparent!',
                    )}
                    style={{ backgroundColor: option.colour }}
                  />
                  <span className={cn('min-w-0 flex-1 truncate', !on && 'line-through')}>
                    {option.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatNumber(option.count)}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
