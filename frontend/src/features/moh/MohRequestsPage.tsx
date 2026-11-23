'use client';

import { Copy, List } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { FilterTabs } from '@/components/FilterTabs';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import type { WarehouseRequest } from '@/features/fulfilment/api';
import { formatQuantities, totalPieces } from '@/features/fulfilment/products';
import { REQUEST_STATUS, WAREHOUSE_NAMES } from '@/features/fulfilment/status';
import { filterFrom } from '@/features/fulfilment/orderFilters';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';

import { copyText } from '@/lib/copyText';
import { useDistrictContext } from '@/features/district/DistrictContext';
import { DistrictFilter } from './DistrictFilter';
import { listHref, MOH_PATHS, REQUEST_FILTERS } from './filters';
import { useNationalRequests } from './queries';

/** District store orders to NMS and JMS, filtered by status and district in the address. */
export default function MohRequestsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const context = useDistrictContext();
  const district = context ? context.district : params.get('district') || null;
  const filter = filterFrom(REQUEST_FILTERS, params.get('status'));
  const requests = useNationalRequests(district);

  const columns = useMemo<DataTableColumn<WarehouseRequest>[]>(
    () => [
      {
        id: 'id',
        header: 'Request',
        value: (request) => request.id,
        cell: (request) => (
          <div className="min-w-0">
            <div className="font-medium">{request.id}</div>
            <div className="text-muted-foreground text-xs">
              {formatTimestamp(request.created_at)}
            </div>
          </div>
        ),
      },
      {
        id: 'route',
        header: 'From → for',
        value: (request) => `${request.warehouse} ${request.district}`,
        cell: (request) => (
          <div className="min-w-0">
            <div>
              {request.warehouse} → {request.district}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {WAREHOUSE_NAMES[request.warehouse]}
            </div>
          </div>
        ),
      },
      {
        id: 'needed',
        header: 'Needed',
        value: (request) => totalPieces(request.items),
        cell: (request) => formatQuantities(request.items),
      },
      {
        id: 'issued',
        header: 'Issued',
        value: (request) => (request.dispatch ? totalPieces(request.dispatch.items) : null),
        cell: (request) =>
          request.dispatch ? formatQuantities(request.dispatch.items) : EMPTY_VALUE,
      },
      {
        id: 'accepted',
        header: 'Accepted',
        value: (request) => (request.receipt ? totalPieces(request.receipt.accepted) : null),
        cell: (request) =>
          request.receipt ? (
            <div className="min-w-0">
              <div>{formatQuantities(request.receipt.accepted)}</div>
              {request.receipt.discrepancy ? (
                <div className="text-warning text-xs">
                  Discrepancy: {request.receipt.discrepancy.type}
                </div>
              ) : null}
            </div>
          ) : (
            EMPTY_VALUE
          ),
      },
      {
        id: 'status',
        filter: 'select',
        header: 'Status',
        value: (request) => REQUEST_STATUS[request.status].label,
        cell: (request) => (
          <StatusBadge
            status={REQUEST_STATUS[request.status].label}
            tone={REQUEST_STATUS[request.status].tone}
          />
        ),
      },
    ],
    [],
  );

  const rows = requests.data?.filter(filter.keeps);
  const isFiltered = filter.value !== 'all' || district !== null;

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The warehouse requests" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          label="Filter warehouse requests by status"
          value={filter.value}
          hrefFor={(status) => listHref(MOH_PATHS.requests, { status, district })}
          tabs={REQUEST_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            ...(requests.data ? { count: requests.data.filter(option.keeps).length } : {}),
          }))}
        />
        {!context && (
          <DistrictFilter
            value={district}
            hrefFor={(next) =>
              listHref(MOH_PATHS.requests, { status: filter.value, district: next })
            }
          />
        )}
      </div>
      <DataTable
        label="Warehouse requests"
        preferencesKey="moh-warehouse-requests"
        columns={columns}
        rows={rows}
        getRowId={(request) => request.id}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        isRetrying={requests.isRefetching}
        searchPlaceholder="Search requests…"
        emptyTitle={isFiltered ? 'No requests in this view' : 'No warehouse requests yet'}
        emptyDescription={
          isFiltered
            ? 'Choose another status or district to see the rest of the requests.'
            : 'Requests district stores send to NMS and JMS appear here.'
        }
        rowActions={(request) => (
          <RowActions
            label={`Actions for ${request.id}`}
            actions={[
              {
                label: `View ${request.district} hotspot orders`,
                icon: List,
                onSelect: () => {
                  router.push(listHref(MOH_PATHS.orders, { district: request.district }));
                },
              },
              {
                label: 'Copy request ID',
                icon: Copy,
                onSelect: () => void copyText(request.id, 'request ID'),
              },
            ]}
          />
        )}
      />
    </div>
  );
}
