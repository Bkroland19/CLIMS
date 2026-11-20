'use client';

import { Copy, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { ExportButton } from '@/components/ExportButton';
import { PageActions } from '@/components/PageActions';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { copyText } from '@/lib/copyText';
import { formatNumber } from '@/lib/format';

import { storeKindLabel, type Store } from './api';
import { useStores } from './queries';

const USERS_PATH = '/moh/users';

function storeSubtitle(store: Store): string {
  if (store.kind === 'national') return store.organisation ?? 'National warehouse';
  return store.region ? `${store.region} region` : (store.district ?? 'District store');
}

/** National warehouses and district stores. NOT YET IN THE GO API (mock data). */
export default function StoresPage() {
  const stores = useStores();
  const router = useRouter();

  const columns = useMemo<DataTableColumn<Store>[]>(
    () => [
      {
        id: 'name',
        header: 'Store',
        value: (store) => store.name,
        cell: (store) => (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{store.name}</span>
              {store.needs_confirmation ? (
                <StatusBadge status="Confirm with data team" tone="caution" />
              ) : null}
            </div>
            <div className="text-muted-foreground truncate text-xs">{storeSubtitle(store)}</div>
          </div>
        ),
      },
      { id: 'kind', header: 'Type', value: (store) => storeKindLabel(store.kind) },
      {
        id: 'code',
        header: 'Code',
        value: (store) => store.code,
        cell: (store) => <span className="font-mono text-xs">{store.code}</span>,
      },
      {
        id: 'users',
        header: 'Users',
        numeric: true,
        value: (store) => store.user_count,
        cell: (store) => formatNumber(store.user_count),
      },
      {
        id: 'stock',
        header: 'On hand (M / F)',
        numeric: true,
        value: (store) => store.on_hand.male + store.on_hand.female,
        cell: (store) => (
          <span className="tabular-nums">
            {formatNumber(store.on_hand.male)} / {formatNumber(store.on_hand.female)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The stores and their stock" />
      <PageActions>
        <ExportButton name="Stores" columns={columns} rows={stores.data} />
      </PageActions>
      <DataTable
        label="Stores"
        columns={columns}
        rows={stores.data}
        getRowId={(store) => store.id}
        isLoading={stores.isPending}
        error={stores.error}
        onRetry={() => void stores.refetch()}
        isRetrying={stores.isRefetching}
        searchPlaceholder="Search stores…"
        emptyTitle="No stores yet"
        emptyDescription="National warehouses and district stores appear here once they are set up."
        rowActions={(store) => (
          <RowActions
            label={`Actions for ${store.name}`}
            actions={[
              {
                label: 'View users',
                icon: Users,
                onSelect: () => {
                  router.push(USERS_PATH);
                },
              },
              {
                label: 'Copy store code',
                icon: Copy,
                onSelect: () => {
                  void copyText(store.code, 'store code');
                },
              },
            ]}
          />
        )}
      />
    </div>
  );
}
