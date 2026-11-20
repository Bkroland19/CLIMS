import { FilterTabs } from '@/components/FilterTabs';
import { WAREHOUSES, type WarehouseCode } from '@/features/fulfilment/api';

import { STORE_LABELS } from './paths';

interface StoreSwitchProps {
  store: WarehouseCode;
  /** Where each store's tab goes, e.g. the same page with `?store=JMS`. */
  hrefFor: (store: WarehouseCode) => string;
}

/** Switches the warehouse screens between NMS and JMS. Each choice is a link, so it survives a refresh. */
export function StoreSwitch({ store, hrefFor }: StoreSwitchProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-muted-foreground text-sm">Warehouse</span>
      <FilterTabs
        label="Switch warehouse"
        value={store}
        hrefFor={hrefFor}
        tabs={WAREHOUSES.map((code) => ({ value: code, label: STORE_LABELS[code] }))}
      />
    </div>
  );
}
