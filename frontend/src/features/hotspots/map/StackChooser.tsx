'use client';

import { X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useMemo, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';

import { byName, type ColourBy } from './filters';
import { HotspotRow } from './HotspotList';
import type { MapHotspot } from './records';

interface StackChooserProps {
  /** The hotspots under the pointer, in any order. */
  hotspots: readonly MapHotspot[];
  /** Every one was recorded at exactly the same position, so zooming in will not part them. */
  samePlace: boolean;
  colourBy: ColourBy;
  colourOf: (hotspot: MapHotspot) => string;
  /** `byKeyboard`: the choice was made with the keyboard, so focus should follow it. */
  onSelect: (id: string, byKeyboard: boolean) => void;
  onHighlight: (id: string | null) => void;
  onClose: () => void;
}

/**
 * Several hotspots under one pin: the map can only show the top one, so a click
 * opens this list beside the pin to choose from. Its rows are the side list's.
 * Focus moves to its title when it opens; Escape closes it.
 */
export function StackChooser({
  hotspots,
  samePlace,
  colourBy,
  colourOf,
  onSelect,
  onHighlight,
  onClose,
}: StackChooserProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const byKeyboard = useRef(false);
  const sorted = useMemo(() => [...hotspots].sort(byName), [hotspots]);
  const close = useEffectEvent(onClose);
  const highlight = useEffectEvent(onHighlight);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    const root = rootRef.current;
    const onPointerDown = () => {
      byKeyboard.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      byKeyboard.current = true;
      if (event.key !== 'Escape') return;
      // Handled here, so a full-view map stays full view.
      event.preventDefault();
      close();
    };
    root?.addEventListener('pointerdown', onPointerDown);
    root?.addEventListener('keydown', onKeyDown);
    return () => {
      root?.removeEventListener('pointerdown', onPointerDown);
      root?.removeEventListener('keydown', onKeyDown);
      highlight(null);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-labelledby={titleId}
      className="flex w-72 max-w-full flex-col"
    >
      <div className="flex items-start gap-2 border-b py-2 pr-1.5 pl-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <h2
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className="text-sm font-semibold tabular-nums outline-none"
          >
            {formatNumber(sorted.length)} hotspots here
          </h2>
          <p className="text-muted-foreground text-xs">
            {samePlace
              ? 'All recorded at exactly the same position.'
              : 'Their pins overlap at this zoom.'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label="Close"
          className="text-muted-foreground shrink-0"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <ul
        aria-labelledby={titleId}
        className="max-h-[min(15rem,40svh)] overflow-y-auto overscroll-contain py-1"
        onMouseLeave={() => {
          onHighlight(null);
        }}
      >
        {sorted.map((hotspot) => (
          <li key={hotspot.id}>
            <HotspotRow
              hotspot={hotspot}
              colourBy={colourBy}
              colourOf={colourOf}
              onSelect={(id) => {
                onSelect(id, byKeyboard.current);
              }}
              onHighlight={onHighlight}
              className="px-3"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
