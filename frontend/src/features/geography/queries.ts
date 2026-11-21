import { useApiQuery } from '@/lib/api';

import { listDistrictsIn, listRegions, listSubcounties, listDistrictHotspots } from './api';

/** Places change on the scale of years; one fetch per session is plenty. */
const PLACES_STALE_TIME = 30 * 60_000;

export function useRegions(enabled = true) {
  return useApiQuery(['geography', 'regions'], listRegions, {
    enabled,
    staleTime: PLACES_STALE_TIME,
  });
}

/** A region's districts, once a region is chosen. */
export function useDistricts(regionId: string) {
  return useApiQuery(
    ['geography', 'districts', regionId],
    (http, signal) => listDistrictsIn(http, regionId, signal),
    { enabled: regionId !== '', staleTime: PLACES_STALE_TIME },
  );
}

/** A district's subcounties, once a district is chosen. */
export function useSubcounties(districtId: string) {
  return useApiQuery(
    ['geography', 'subcounties', districtId],
    (http, signal) => listSubcounties(http, districtId, signal),
    { enabled: districtId !== '', staleTime: PLACES_STALE_TIME },
  );
}

/**
 * The hotspots in a district, once one is chosen: a hotspot manager picks
 * theirs from it, and a VHT's village is suggested from its subcounty's.
 */
export function useDistrictHotspots(districtId: string) {
  return useApiQuery(
    ['geography', 'hotspots', districtId],
    (http, signal) => listDistrictHotspots(http, districtId, signal),
    { enabled: districtId !== '', staleTime: 5 * 60_000 },
  );
}
