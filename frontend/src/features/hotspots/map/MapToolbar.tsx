'use client';

import { ChevronDown, Maximize2, Minimize2, Search, X, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { MapView } from './filters';

/*
 * The controls above the map: search, the filters (each a menu of choices with
 * how many hotspots each keeps), how the map draws them, and the base map.
 */

export interface FacetOption<Key extends string> {
  key: Key;
  label: string;
  count: number;
  /** A colour swatch, when the choice is also a map colour. */
  colour?: string;
  /** The glyph the choice's pins carry on the map. */
  icon?: LucideIcon;
}

interface FacetMenuProps<Key extends string> {
  label: string;
  options: readonly FacetOption<Key>[];
  /** `null` shows every choice. */
  shown: readonly Key[] | null;
  onToggle: (key: Key) => void;
  onShowAll: () => void;
}

export function FacetMenu<Key extends string>({
  label,
  options,
  shown,
  onToggle,
  onShowAll,
}: FacetMenuProps<Key>) {
  const shownCount = shown === null ? options.length : shown.length;
  const filtered = shown !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('bg-card shrink-0', filtered && 'border-ring')}
          aria-label={
            filtered
              ? `${label}: ${String(shownCount)} of ${String(options.length)} shown`
              : `${label}: all shown`
          }
        >
          {label}
          {filtered ? (
            <span className="bg-primary/15 text-foreground rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums">
              {shownCount}/{options.length}
            </span>
          ) : null}
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Show hotspots by {label.toLowerCase()}
        </DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={shown === null || shown.includes(option.key)}
            onSelect={(event) => {
              // Keep the menu open: people usually change several at once.
              event.preventDefault();
              onToggle(option.key);
            }}
          >
            {option.colour ? (
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: option.colour }}
              />
            ) : null}
            {option.icon ? (
              <option.icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatNumber(option.count)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!filtered} onSelect={onShowAll}>
          Show all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SegmentedProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string; icon?: ReactNode }[];
  onChange: (value: Value) => void;
}

/** A small set of exclusive choices, as a radio group of buttons. */
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<Value>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex shrink-0 rounded-lg p-0.5"
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <Button
            variant="ghost"
            size="sm"
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={(event) => {
              // Arrow keys move between the choices, as in any radio group.
              const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
              if (step === undefined) return;
              event.preventDefault();
              const nextIndex = (index + step + options.length) % options.length;
              const next = options[nextIndex];
              if (!next) return;
              onChange(next.value);
              const siblings = event.currentTarget.parentElement?.children;
              const target = siblings?.item(nextIndex);
              if (target instanceof HTMLElement) target.focus();
            }}
            className={cn(
              'focus-visible:ring-ring inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 [&_svg]:size-3.5',
              checked
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

interface CompactSelectProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
}

/** A labelled 28px select for toolbars. */
export function CompactSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: CompactSelectProps<Value>) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 shrink-0 items-center gap-1.5', className)}>
      <Label htmlFor={id} className="text-muted-foreground text-[0.8125rem] font-normal">
        {label}
      </Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onChange(option.value);
        }}
      >
        <SelectTrigger id={id} size="sm" className="bg-card min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter in the box: open the best match. */
  onSubmit: () => void;
  resultCount: number | null;
}

export function SearchBox({ value, onChange, onSubmit, resultCount }: SearchBoxProps) {
  const id = useId();
  return (
    <div className="relative w-full min-w-0 sm:w-64">
      <label htmlFor={id} className="sr-only">
        Search hotspots by name, place or contact
      </label>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        id={id}
        type="search"
        value={value}
        placeholder="Search name, place or contact"
        autoComplete="off"
        className="bg-card h-7 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        aria-describedby={resultCount === null ? undefined : `${id}-count`}
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
          }}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
      <span id={`${id}-count`} className="sr-only" aria-live="polite">
        {resultCount === null
          ? ''
          : `${formatNumber(resultCount)} ${resultCount === 1 ? 'hotspot matches' : 'hotspots match'}`}
      </span>
    </div>
  );
}

export const VIEW_LABELS: Record<MapView, string> = {
  clusters: 'Clusters',
  heatmap: 'Heatmap',
  points: 'Points',
};

/** Fills the window with the map and its list; Escape returns. Icon only on a phone. */
export function ExpandButton({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = expanded ? 'Exit full view' : 'Full view';
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('bg-card shrink-0 max-sm:size-7 max-sm:px-0', className)}
      aria-label={label}
      onClick={onToggle}
    >
      {expanded ? (
        <Minimize2 data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Maximize2 data-icon="inline-start" aria-hidden="true" />
      )}
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}
