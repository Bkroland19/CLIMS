import { useApiQuery } from '@/lib/api';

import { listOrganizationUnits, type Lookup } from './api';

/** Lookup lists change rarely; keep them for the session rather than refetching per page. */
const LOOKUP_STALE_TIME = 5 * 60_000;

export function useOrganizationUnits() {
  return useApiQuery(['organization-units'], listOrganizationUnits, {
    staleTime: LOOKUP_STALE_TIME,
  });
}

/** The display name for an id in a lookup list, falling back to the id itself. */
export function lookupName(list: readonly Lookup[] | undefined, id: number | null): string | null {
  if (id === null) return null;
  return list?.find((item) => item.id === id)?.name ?? `#${id}`;
}
