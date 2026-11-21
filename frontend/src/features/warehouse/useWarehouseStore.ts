'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import type { WarehouseCode } from '@/features/fulfilment/api';
import { readJson, writeJson } from '@/lib/storage/jsonStorage';
import { useAppStorage } from '@/lib/storage/StorageProvider';
import { useAllowedWarehouse } from '@/navigation/useAccess';

import { DEFAULT_STORE, parseStore, STORE_PARAM, withStore } from './paths';

const REMEMBERED_STORE_KEY = 'clims.warehouse.store';

/**
 * The store the warehouse screens show: the one in the address, else the one
 * last chosen in this browser (sidebar links carry no query), else NMS. A JMS
 * or NMS user only ever sees their own store, whatever the address says.
 * `href` adds the store to a warehouse path, so links stay on the same store.
 */
export function useWarehouseStore(): { store: WarehouseCode; href: (path: string) => string } {
  const storage = useAppStorage();
  const fromAddress = parseStore(useSearchParams().get(STORE_PARAM));
  const requested =
    fromAddress ?? readJson(storage, REMEMBERED_STORE_KEY, parseStore) ?? DEFAULT_STORE;
  const store = useAllowedWarehouse(requested);

  useEffect(() => {
    if (fromAddress) writeJson(storage, REMEMBERED_STORE_KEY, fromAddress);
  }, [storage, fromAddress]);

  return { store, href: (path) => withStore(path, store) };
}
