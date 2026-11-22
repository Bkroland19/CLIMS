import { ItemsTable } from '@/components/ItemsTable';
import { formatNumber, formatTimestamp } from '@/lib/format';

import { Loaded } from './parts';
import { useHotspotStock } from './queries';

interface HotspotSupplyProps {
  hotspotId: string;
  /** Limits the rows to one product, e.g. the one an alert is about. */
  condomId?: string;
}

/**
 * What a hotspot has been sent from the district store, per product and unit
 * (`GET /inventory/hotspots`): delivered so far, in how many deliveries, the
 * last one, and what is on its way.
 */
export function HotspotSupply({ hotspotId, condomId }: HotspotSupplyProps) {
  const supply = useHotspotStock();
  const rows = (supply.data ?? []).filter(
    (row) =>
      row.hot_spot_id === hotspotId &&
      // The row for open alerts has no unit and nothing delivered; the alerts are shown elsewhere.
      row.unit_of_measure_id !== null &&
      (condomId === undefined || row.condom_id === condomId),
  );
  return (
    <Loaded
      isPending={supply.isPending}
      error={supply.error}
      errorTitle="Could not load what this hotspot has been sent"
      onRetry={() => void supply.refetch()}
      isRetrying={supply.isRefetching}
    >
      <ItemsTable
        label="Supply to this hotspot"
        rows={rows}
        getRowId={(row) => `${row.condom_id}-${row.unit_of_measure_id ?? 'none'}`}
        emptyText="Nothing has been sent to this hotspot yet."
        columns={[
          ...(condomId === undefined
            ? [
                {
                  id: 'product',
                  header: 'Product',
                  cell: (row: (typeof rows)[number]) => row.product,
                },
              ]
            : []),
          { id: 'unit', header: 'Unit', cell: (row) => row.unit ?? '—' },
          {
            id: 'delivered',
            header: 'Delivered',
            numeric: true,
            cell: (row) => formatNumber(row.delivered),
          },
          {
            id: 'deliveries',
            header: 'Deliveries',
            numeric: true,
            cell: (row) => formatNumber(row.deliveries),
          },
          {
            id: 'last',
            header: 'Last delivered',
            cell: (row) => formatTimestamp(row.last_delivered_at),
          },
          {
            id: 'transit',
            header: 'On the way',
            numeric: true,
            cell: (row) => formatNumber(row.in_transit),
          },
        ]}
      />
    </Loaded>
  );
}
