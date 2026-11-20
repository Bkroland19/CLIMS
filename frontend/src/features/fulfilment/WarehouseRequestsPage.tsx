'use client';

import { ArrowRight, PackageCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions } from '@/components/data-table/RowActions';
import { PageActions } from '@/components/PageActions';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatTimestamp } from '@/lib/format';

import type { WarehouseRequest } from './api';
import { formatQuantities, totalPieces } from './products';
import { useRequests } from './queries';
import { REQUEST_STATUS, WAREHOUSE_NAMES } from './status';
import { DCFP_PATHS } from './tasks';

export default function WarehouseRequestsPage() {
  const requests = useRequests();
  const router = useRouter();

  const columns = useMemo<DataTableColumn<WarehouseRequest>[]>(
    () => [
      {
        id: 'id',
        header: 'Request',
        value: (request) => request.id,
        cell: (request) => (
          <Link
            href={DCFP_PATHS.request(request.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {request.id}
          </Link>
        ),
      },
      {
        id: 'warehouse',
        header: 'Ordered from',
        value: (request) => request.warehouse,
        cell: (request) => (
          <div className="min-w-0">
            <div>{request.warehouse}</div>
            <div className="text-muted-foreground truncate text-xs">
              {WAREHOUSE_NAMES[request.warehouse]}
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
        id: 'linked',
        header: 'Held orders',
        value: (request) => request.linked_orders.join(', '),
      },
      {
        id: 'sent',
        header: 'Sent',
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
    ],
    [],
  );

  const newRequest = (
    <Button asChild>
      <Link href={DCFP_PATHS.newRequest}>
        <Plus data-icon="inline-start" />
        New request
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageActions>{newRequest}</PageActions>
      <SampleDataNotice subject="The warehouse requests" />
      <DataTable
        label="Warehouse requests"
        columns={columns}
        rows={requests.data}
        getRowId={(request) => request.id}
        isLoading={requests.isPending}
        error={requests.error}
        onRetry={() => void requests.refetch()}
        isRetrying={requests.isRefetching}
        searchPlaceholder="Search requests…"
        emptyTitle="No warehouse requests yet"
        emptyDescription="Request stock from NMS or JMS when the district store runs low."
        emptyAction={newRequest}
        rowActions={(request) => (
          <RowActions
            label={`Actions for ${request.id}`}
            actions={[
              request.status === 'dispatched'
                ? {
                    label: 'Receive stock',
                    icon: PackageCheck,
                    onSelect: () => {
                      router.push(DCFP_PATHS.request(request.id));
                    },
                  }
                : {
                    label: 'Open request',
                    icon: ArrowRight,
                    onSelect: () => {
                      router.push(DCFP_PATHS.request(request.id));
                    },
                  },
            ]}
          />
        )}
      />
    </div>
  );
}
