'use client';

import { useDistrictContext } from '@/features/district/DistrictContext';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions, type RowActionItem } from '@/components/data-table/RowActions';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import type { WarehouseCode, WarehouseRequest } from '@/features/fulfilment/api';
import { formatQuantities, totalPieces } from '@/features/fulfilment/products';
import { REQUEST_STATUS } from '@/features/fulfilment/status';
import { getErrorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';

import { WAREHOUSE_PATHS, withStore } from './paths';
import { isNew } from './progress';
import { useAcceptWarehouseRequest, useWarehouseRequests } from './queries';
import { StoreSwitch } from './StoreSwitch';
import { REQUEST_FILTERS, requestFilterFrom } from './tasks';
import { useWarehouseStore } from './useWarehouseStore';

function columnsFor(store: WarehouseCode): DataTableColumn<WarehouseRequest>[] {
  return [
    {
      id: 'id',
      header: 'Request',
      value: (request) => request.id,
      cell: (request) => (
        <Link
          href={withStore(WAREHOUSE_PATHS.request(request.id), store)}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {request.id}
        </Link>
      ),
    },
    {
      id: 'district',
      header: 'Ordered for',
      value: (request) => request.district,
      cell: (request) => (
        <div className="min-w-0">
          <div className="truncate">{request.district} district store</div>
          <div className="text-muted-foreground truncate text-xs">
            {request.requested_by} · DCFP
          </div>
        </div>
      ),
    },
    {
      id: 'items',
      header: 'Quantity needed',
      value: (request) => totalPieces(request.items),
      cell: (request) => formatQuantities(request.items),
    },
    {
      id: 'received',
      header: 'Received',
      value: (request) => request.created_at,
      cell: (request) => formatTimestamp(request.created_at),
    },
    {
      id: 'status',
      header: 'Status',
      value: (request) => REQUEST_STATUS[request.status].label,
      cell: (request) => (
        <StatusBadge
          status={REQUEST_STATUS[request.status].label}
          tone={REQUEST_STATUS[request.status].tone}
        />
      ),
    },
  ];
}

export default function DistrictRequestsPage() {
  const { store, href } = useWarehouseStore();
  const district = useDistrictContext()?.district;
  const requests = useWarehouseRequests(store);
  const visibleRequests = district
    ? requests.data?.filter((request) => request.district === district)
    : requests.data;
  const accept = useAcceptWarehouseRequest(store);
  const router = useRouter();
  const filter = requestFilterFrom(useSearchParams().get('status'));
  const columns = useMemo(() => columnsFor(store), [store]);

  const rows = visibleRequests?.filter(filter.keeps);

  function actionsFor(request: WarehouseRequest): RowActionItem[] {
    const open = {
      label: isNew(request) ? 'Review request' : 'Open request',
      icon: ArrowRight,
      onSelect: () => {
        router.push(href(WAREHOUSE_PATHS.request(request.id)));
      },
    };
    if (!isNew(request)) return [open];
    return [
      open,
      {
        label: 'Accept and queue',
        icon: Check,
        onSelect: () => {
          accept.mutate(request.id, {
            onError: (error) => {
              toast.error(`Could not accept ${request.id}: ${getErrorMessage(error)}`);
            },
          });
        },
      },
    ];
  }

  return (
    <div className="flex flex-col gap-4">
      <StoreSwitch store={store} hrefFor={(code) => withStore(WAREHOUSE_PATHS.requests, code)} />
      <SampleDataNotice subject="The district requests" />
      <FilterTabs
        label="Filter requests by status"
        value={filter.value}
        hrefFor={(value) =>
          href(
            value === 'all' ? WAREHOUSE_PATHS.requests : WAREHOUSE_PATHS.requestsWithStatus(value),
          )
        }
        tabs={REQUEST_FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
          ...(visibleRequests ? { count: visibleRequests.filter(option.keeps).length } : {}),
        }))}
      />
      <DataTable
        label={`District requests at ${store}`}
        columns={columns}
        rows={rows}
        getRowId={(request) => request.id}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        isRetrying={requests.isRefetching}
        searchPlaceholder="Search requests…"
        emptyTitle={
          filter.value === 'all'
            ? `No district requests at ${store} yet`
            : 'No requests in this view'
        }
        emptyDescription={
          filter.value === 'all'
            ? 'Requests from district stores appear here as soon as they are sent.'
            : 'Choose another filter to see the rest of the requests.'
        }
        rowActions={(request) => (
          <RowActions label={`Actions for ${request.id}`} actions={actionsFor(request)} />
        )}
      />
    </div>
  );
}
