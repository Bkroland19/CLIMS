'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useDistrictStores } from './queries';

const EVERY_DISTRICT = 'all';

interface DistrictFilterProps {
  /** The district in the address, or null for every district. */
  value: string | null;
  /** The address of the list narrowed to `district` (null for every district). */
  hrefFor: (district: string | null) => string;
}

/**
 * Narrows a national list to one district. The choice goes in the address,
 * so a filtered list survives a refresh and can be shared. The districts are
 * the ones with a district store.
 */
export function DistrictFilter({ value, hrefFor }: DistrictFilterProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const router = useRouter();
  const stores = useDistrictStores();
  const names = (stores.data ?? []).map((store) => store.district);
  // A district typed into the address stays selectable even before the list loads.
  const options = value && !names.includes(value) ? [value, ...names] : names;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="shrink-0">
          District
        </Label>
        <Select
          value={value ?? EVERY_DISTRICT}
          onValueChange={(next) => {
            router.push(hrefFor(next === EVERY_DISTRICT ? null : next));
          }}
          disabled={stores.isPending}
        >
          <SelectTrigger
            id={id}
            size="sm"
            className="bg-card min-w-44"
            aria-describedby={stores.isError ? errorId : undefined}
          >
            {stores.isPending ? (
              <>
                <span role="status" className="sr-only">
                  Loading districts…
                </span>
                <Skeleton aria-hidden="true" className="h-3.5 w-24" />
              </>
            ) : (
              <SelectValue placeholder="All districts" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERY_DISTRICT}>All districts</SelectItem>
            {options.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {stores.isError ? (
        <p id={errorId} className="text-muted-foreground text-xs">
          Could not load the list of districts.{' '}
          <Button
            variant="link"
            size="sm"
            type="button"
            className="text-foreground h-auto px-0 text-xs underline"
            onClick={() => void stores.refetch()}
          >
            Try again
          </Button>
        </p>
      ) : null}
    </div>
  );
}
