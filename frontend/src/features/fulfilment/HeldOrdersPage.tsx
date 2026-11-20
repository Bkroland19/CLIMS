'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { SampleDataNotice } from '@/components/SampleData';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';

import type { HotspotOrder } from './api';
import { covers, formatQuantities } from './products';
import { useDistrictStore, useOrders, useReleaseOrder } from './queries';
import { DCFP_PATHS } from './tasks';

export default function HeldOrdersPage() {
  const orders = useOrders();
  const store = useDistrictStore();
  const release = useReleaseOrder();
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);

  const failed = orders.error ?? store.error;
  const held = orders.data?.filter((order) => order.status === 'on_hold') ?? [];
  const ready = orders.data?.filter((order) => order.status === 'confirmed').length ?? 0;

  function releaseOrder(order: HotspotOrder) {
    setFailure(null);
    release.mutate(
      { id: order.id },
      {
        onError: (error) => {
          setFailure({ id: order.id, message: getErrorMessage(error) });
        },
      },
    );
  }

  let body;
  if (failed) {
    body = (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load held orders"
          error={failed}
          onRetry={() => {
            void orders.refetch();
            void store.refetch();
          }}
          isRetrying={orders.isRefetching || store.isRefetching}
        />
      </div>
    );
  } else if (!orders.data || !store.data) {
    body = (
      <div className="flex flex-col gap-3" role="status">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <span className="sr-only">Loading held orders…</span>
      </div>
    );
  } else if (held.length === 0) {
    body = (
      <div className="bg-card rounded-card border">
        <EmptyState
          icon={CircleCheck}
          title="No orders on hold"
          description={
            ready > 0
              ? `${String(ready)} confirmed order${ready > 1 ? 's are' : ' is'} ready to go out with a rider.`
              : 'Every order has been confirmed or is already out.'
          }
          action={
            <Button asChild variant="outline">
              <Link href={DCFP_PATHS.dispatch}>Go to dispatch</Link>
            </Button>
          }
        />
      </div>
    );
  } else {
    const stock = store.data.stock;
    body = (
      <ul className="bg-card rounded-card divide-y border" aria-label="Orders on hold">
        {held.map((order) => {
          const canRelease = covers(stock, order.approved);
          const isReleasing = release.isPending && release.variables.id === order.id;
          return (
            <li
              key={order.id}
              className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={DCFP_PATHS.order(order.id)}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {order.id}
                  </Link>
                  <StatusBadge
                    status={canRelease ? 'Can be fulfilled' : 'Still short'}
                    tone={canRelease ? 'positive' : 'caution'}
                  />
                </div>
                <p className="text-sm break-words">{order.hotspot.name}</p>
                <p className="text-muted-foreground text-xs">
                  On hold since {formatTimestamp(order.created_at)} ·{' '}
                  {order.warehouse_request_id ? (
                    <Link
                      href={DCFP_PATHS.request(order.warehouse_request_id)}
                      className="underline-offset-4 hover:underline"
                    >
                      Linked to {order.warehouse_request_id}
                    </Link>
                  ) : (
                    'No warehouse request'
                  )}
                </p>
                {failure?.id === order.id ? (
                  <p className="text-destructive mt-1 text-sm" role="alert">
                    {failure.message}
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-medium tabular-nums md:w-48 md:text-right">
                {formatQuantities(order.approved)}
              </p>
              {canRelease ? (
                <Button
                  onClick={() => {
                    releaseOrder(order);
                  }}
                  disabled={release.isPending}
                  className="md:w-44"
                >
                  {isReleasing ? 'Releasing…' : 'Release and confirm'}
                </Button>
              ) : (
                <Button variant="outline" disabled className="md:w-44">
                  Not enough stock
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The orders and stock figures" />
      <Alert variant="info">
        <AlertDescription className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span>Release an order once the store can cover it.</span>
          <span>
            In district store:{' '}
            <span className="font-semibold">
              {store.data ? formatQuantities(store.data.stock) : '—'}
            </span>
          </span>
        </AlertDescription>
      </Alert>
      {body}
    </div>
  );
}
