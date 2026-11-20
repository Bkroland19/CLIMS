'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import type { WarehouseCode } from '@/features/fulfilment/api';
import { readJson, writeJson } from '@/lib/storage/jsonStorage';
import { useAppStorage } from '@/lib/storage/StorageProvider';

import { DEFAULT_STORE, parseStore, STORE_PARAM, withStore } from './paths';

const REMEMBERED_STORE_KEY = 'clims.warehouse.store';

/**
 * The store the warehouse screens show: the one in the address, else the one
 * last chosen in this browser (sidebar links carry no query), else NMS.
 * `href` adds the store to a warehouse path, so links stay on the same store.
 */
export function useWarehouseStore(): { store: WarehouseCode; href: (path: string) => string } {
  const storage = useAppStorage();
  const fromAddress = parseStore(useSearchParams().get(STORE_PARAM));
  const store = fromAddress ?? readJson(storage, REMEMBERED_STORE_KEY, parseStore) ?? DEFAULT_STORE;

  useEffect(() => {
    if (fromAddress) writeJson(storage, REMEMBERED_STORE_KEY, fromAddress);
  }, [storage, fromAddress]);

  return { store, href: (path) => withStore(path, store) };
}
