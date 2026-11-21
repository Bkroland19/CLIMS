'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { FilterSelect } from '@/components/FilterSelect';
import { useSession } from '@/features/auth/hooks';
import { readJson, writeJson } from '@/lib/storage/jsonStorage';
import { useAppStorage } from '@/lib/storage/StorageProvider';
import { useLocationDistricts } from '@/features/hotspots/queries';
import { useDistrictStores } from '@/features/moh/queries';
import { useWarehouseRequests } from '@/features/warehouse/queries';
import { useWarehouseStore } from '@/features/warehouse/useWarehouseStore';

const ALL = 'all';
const DistrictContext = createContext<{
  district: string | null;
  districtId: string | null;
} | null>(null);

export function useDistrictContext() {
  return useContext(DistrictContext);
}

export function DistrictContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const isMoh = pathname === '/moh' || pathname.startsWith('/moh/');
  const isWarehouse = pathname === '/warehouse' || pathname.startsWith('/warehouse/');
  const isMap = pathname === '/moh/hotspot-map';
  const { store } = useWarehouseStore();
  const requests = useWarehouseRequests(store, { enabled: isWarehouse });
  const stores = useDistrictStores(isMoh && !isMap);
  const locations = useLocationDistricts(isMoh);
  const storage = useAppStorage();
  const session = useSession();
  const storageKey = `clims.district.${session?.user.id ?? 'anonymous'}`;
  const remembered = readJson(storage, storageKey, (value) =>
    typeof value === 'string' ? value : null,
  );
  const locationId = isMap ? params.get('district_id') : null;
  const fromUrl =
    params.get('district') ??
    (locationId ? locations.data?.find((location) => location.id === locationId)?.name : null);
  const selected = (fromUrl ?? remembered) || null;
  const locationsByName = new Map(
    (locations.data ?? []).map((location) => [location.name, location.id]),
  );
  const options = [
    ...new Set(
      isWarehouse
        ? (requests.data ?? []).map((request) => request.district)
        : [...locationsByName.keys(), ...(stores.data ?? []).map((district) => district.district)],
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const district = selected && options.includes(selected) ? selected : null;
  const districtId = district ? (locationsByName.get(district) ?? null) : null;

  useEffect(() => {
    if (fromUrl && (isMoh || isWarehouse)) writeJson(storage, storageKey, fromUrl);
  }, [fromUrl, isMoh, isWarehouse, storage, storageKey]);

  const showSelector =
    /^(\/moh(?:\/(?:hotspot-map|orders(?:\/warehouse)?|reports))?|\/warehouse(?:\/requests)?)$/.test(
      pathname,
    );

  return (
    <DistrictContext.Provider value={isMoh || isWarehouse ? { district, districtId } : null}>
      {showSelector && (
        <FilterSelect
          label="District"
          value={district ?? ALL}
          disabled={isWarehouse ? requests.isPending : locations.isPending && stores.isPending}
          options={[
            { value: ALL, label: isWarehouse ? 'All served districts' : 'All districts' },
            ...options.map((name) => ({ value: name, label: name })),
          ]}
          onValueChange={(value) => {
            writeJson(storage, storageKey, value);
            const next = new URLSearchParams(params.toString());
            next.delete('district_id');
            next.set('district', value);
            router.push(`${pathname}?${next}`);
          }}
        />
      )}
      {children}
    </DistrictContext.Provider>
  );
}
