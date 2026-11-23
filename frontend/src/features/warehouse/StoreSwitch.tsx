import { Warehouse } from 'lucide-react';

import { FilterTabs } from '@/components/FilterTabs';
import type { WarehouseCode } from '@/features/fulfilment/api';
import { useWebAccess } from '@/navigation/useAccess';

import { STORE_LABELS } from './paths';

interface StoreSwitchProps {
  store: WarehouseCode;
  /** Where each store's tab goes, e.g. the same page with `?store=JMS`. */
  hrefFor: (store: WarehouseCode) => string;
}

/**
 * Switches the warehouse screens between NMS and JMS. Each choice is a link, so
 * it survives a refresh. Someone who works in one store sees its name instead.
 */
export function StoreSwitch({ store, hrefFor }: StoreSwitchProps) {
  const { warehouses } = useWebAccess();
  if (warehouses.length <= 1) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Warehouse className="size-4" aria-hidden="true" />
        Warehouse <span className="text-foreground font-medium">{STORE_LABELS[store]}</span>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-muted-foreground text-sm">Warehouse</span>
      <FilterTabs
        label="Switch warehouse"
        value={store}
        hrefFor={hrefFor}
        tabs={warehouses.map((code) => ({ value: code, label: STORE_LABELS[code] }))}
      />
    </div>
  );
}
