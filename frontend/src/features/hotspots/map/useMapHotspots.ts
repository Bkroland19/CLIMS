import { useState } from 'react';

import { useApiQuery } from '@/lib/api';

import { loadHotspots, type LoadProgress, type Partition } from './loadHotspots';

/**
 * Whose hotspots the map loads. `national` is everyone's, a district at a time;
 * `district` is one district's (MOH with a district chosen); `own` is whatever
 * the API scopes the user to: a VHT's submissions or a DCFP's district.
 */
export type MapScope =
  | { kind: 'national'; districts: readonly { id: string; name: string }[] }
  | { kind: 'district'; districtId: string; label: string }
  | { kind: 'own' };

/** Read once per visit; reopening the map within this time is instant. */
const MAP_STALE_TIME = 5 * 60_000;

function scopeKey(scope: MapScope): string {
  return scope.kind === 'district' ? `district:${scope.districtId}` : scope.kind;
}

function partitionsFor(scope: MapScope): Partition[] {
  if (scope.kind === 'own') return [{ districtId: null, label: 'Your hotspots' }];
  if (scope.kind === 'district') return [{ districtId: scope.districtId, label: scope.label }];
  return scope.districts.map(({ id, name }) => ({ districtId: id, label: name }));
}

/**
 * Every hotspot in `scope`. While the first load runs, `progress` holds what has
 * arrived so far, so the map can draw it before the last district is in.
 */
export function useMapHotspots(scope: MapScope, enabled = true) {
  const key = scopeKey(scope);
  const [progress, setProgress] = useState<{ key: string; value: LoadProgress } | null>(null);
  const query = useApiQuery(
    ['hotspots', 'map', key],
    (http, signal) => {
      const partitions = partitionsFor(scope);
      setProgress({
        key,
        value: { hotspots: [], partitionsDone: 0, partitionsTotal: partitions.length },
      });
      return loadHotspots(http, partitions, {
        signal,
        onProgress: (value) => {
          setProgress({ key, value });
        },
      });
    },
    { enabled, staleTime: MAP_STALE_TIME },
  );
  return { query, progress: progress?.key === key ? progress.value : null };
}
