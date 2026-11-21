import { useCallback, useState } from 'react';

import { readJson, writeJson } from '@/lib/storage/jsonStorage';
import { useOptionalAppStorage } from '@/lib/storage/StorageProvider';

export type TableDensity = 'comfortable' | 'compact';

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface TablePreferences {
  /** Ids of the columns the viewer has hidden. */
  hidden: readonly string[];
  density: TableDensity;
  pageSize: number;
}

function parsePreferences(value: unknown): Partial<TablePreferences> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const result: Partial<TablePreferences> = {};
  if (Array.isArray(record.hidden)) {
    result.hidden = record.hidden.filter((id): id is string => typeof id === 'string');
  }
  if (record.density === 'comfortable' || record.density === 'compact') {
    result.density = record.density;
  }
  if (PAGE_SIZES.some((size) => size === record.pageSize)) {
    result.pageSize = record.pageSize as number;
  }
  return result;
}

/**
 * A table's view choices: hidden columns, row density and page size. With a
 * `key` they are remembered in this browser, so a viewer's layout survives a
 * reload; without one they last while the table is on screen. Stored values
 * that no longer make sense (a removed column, an odd page size) are ignored.
 */
export function useTablePreferences(key: string | undefined, defaults: TablePreferences) {
  // Optional: a table rendered outside the app (in a unit test) simply does not remember.
  const storage = useOptionalAppStorage();
  const [preferences, setPreferences] = useState<TablePreferences>(() => {
    const stored =
      key && storage ? readJson(storage, `clims.table.${key}`, parsePreferences) : null;
    return { ...defaults, ...stored };
  });

  const update = useCallback(
    (change: Partial<TablePreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...change };
        if (key && storage) writeJson(storage, `clims.table.${key}`, next);
        return next;
      });
    },
    [key, storage],
  );

  return [preferences, update] as const;
}
