'use client';

import { PackageCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ItemsTable } from '@/components/ItemsTable';
import { SampleDataNotice } from '@/components/SampleData';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTimestamp } from '@/lib/format';

import type { HotspotOrder } from './api';
import { formatQuantities } from './products';
import { useOrders, useRiders } from './queries';
import { isInDelivery, ORDER_STATUS, placeOf, RIDER_STATUS } from './status';
import { DCFP_PATHS } from './tasks';

/** When the delivery last moved: delivered, collected, or handed to the rider. */
function deliverySince(order: HotspotOrder): string | null {
  const { delivery } = order;
  if (!delivery) return null;
  return delivery.delivered_at ?? delivery.collected_at ?? delivery.assigned_at;
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3 p-4" role="status">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function DispatchPage() {
  const orders = useOrders();
  const riders = useRiders();

  const ready = orders.data?.filter((order) => order.status === 'confirmed') ?? [];
  const inDelivery = orders.data?.filter((order) => isInDelivery(order.status)) ?? [];
  const ordersFailed = orders.isError ? (
    <ErrorState
      title="Could not load orders"
      error={orders.error}
      onRetry={() => void orders.refetch()}
      isRetrying={orders.isRefetching}
    />
  ) : null;

  let readyBody: ReactNode;
  if (ordersFailed) readyBody = ordersFailed;
  else if (orders.isPending) readyBody = <Loading label="Loading orders ready to dispatch…" />;
  else if (ready.length === 0) {
    readyBody = (
      <EmptyState
        icon={PackageCheck}
        title="No confirmed orders waiting"
        description="Confirm orders from the queue to dispatch them."
        action={
          <Button asChild variant="outline">
            <Link href={`${DCFP_PATHS.queue}?status=queued`}>Go to the order queue</Link>
          </Button>
        }
      />
    );
  } else {
    readyBody = (
      <ul className="divide-y" aria-label="Ready to dispatch">
        {ready.map((order) => (
          <li
            key={order.id}
            className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">
                {order.id} · {order.hotspot.name}
              </p>
              <p className="text-muted-foreground text-xs">
                {[placeOf(order.hotspot), `confirmed ${formatTimestamp(order.confirmed_at)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <p className="text-sm tabular-nums md:w-48 md:text-right">
              {formatQuantities(order.approved)}
            </p>
            <Button asChild className="self-start md:self-auto">
              <Link href={DCFP_PATHS.dispatchOrder(order.id)}>Prepare dispatch</Link>
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="gap-section flex flex-col">
      <SampleDataNotice subject="The orders and riders" />

      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="border-b py-3">
          <CardTitle>Ready to dispatch</CardTitle>
          <CardDescription>
            Confirmed orders with stock allocated. Assign a rider and print the delivery note.
          </CardDescription>
        </CardHeader>
        {readyBody}
      </Card>

      <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>In delivery</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {ordersFailed ??
              (orders.isPending ? (
                <Loading label="Loading deliveries…" />
              ) : (
                <ItemsTable<HotspotOrder>
                  label="In delivery"
                  rows={inDelivery}
                  getRowId={(order) => order.id}
                  emptyText="No deliveries in progress."
                  columns={[
                    {
                      id: 'order',
                      header: 'Order',
                      cell: (order) => (
                        <div className="min-w-0">
                          <Link
                            href={DCFP_PATHS.order(order.id)}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {order.id}
                          </Link>
                          <div className="text-muted-foreground text-xs">{order.hotspot.name}</div>
                        </div>
                      ),
                    },
                    {
                      id: 'rider',
                      header: 'Rider',
                      cell: (order) => order.delivery?.rider.name ?? '—',
                    },
                    {
                      id: 'note',
                      header: 'Delivery note',
                      cell: (order) => order.delivery?.note_number ?? '—',
                    },
                    {
                      id: 'status',
                      header: 'Status',
                      cell: (order) => (
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge
                            status={ORDER_STATUS[order.status].label}
                            tone={ORDER_STATUS[order.status].tone}
                          />
                          <span className="text-muted-foreground text-xs">
                            {formatTimestamp(deliverySince(order))}
                          </span>
                        </div>
                      ),
                    },
                  ]}
                />
              ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Riders</CardTitle>
          </CardHeader>
          <CardContent>
            {riders.isPending ? (
              <Loading label="Loading riders…" />
            ) : riders.isError ? (
              <ErrorState
                title="Could not load riders"
                error={riders.error}
                onRetry={() => void riders.refetch()}
                isRetrying={riders.isRefetching}
              />
            ) : riders.data.length === 0 ? (
              <p className="text-muted-foreground text-sm">No riders are registered yet.</p>
            ) : (
              <ul className="flex flex-col divide-y" aria-label="Riders">
                {riders.data.map((rider) => (
                  <li
                    key={rider.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{rider.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {rider.plate} · {rider.phone}
                      </p>
                    </div>
                    <StatusBadge
                      status={RIDER_STATUS[rider.status].label}
                      tone={RIDER_STATUS[rider.status].tone}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
