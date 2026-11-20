'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { DetailHeader } from '@/components/DetailHeader';
import { ItemsTable } from '@/components/ItemsTable';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';

import type { BatchLine, HotspotOrder } from './api';
import { productOf } from './products';
import { useDispatchOrder, useOrder, useRiders } from './queries';
import { RecordView } from '@/components/RecordView';
import { ORDER_STATUS, placeOf, RIDER_STATUS } from './status';
import { DCFP_PATHS } from './tasks';

export default function DispatchOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The order and riders" />
      <RecordView
        query={order}
        layout="form"
        noun="order"
        back={{ href: DCFP_PATHS.dispatch, label: 'Back to dispatch' }}
      >
        {(data) => <DispatchView order={data} />}
      </RecordView>
    </div>
  );
}

function DispatchView({ order }: { order: HotspotOrder }) {
  const router = useRouter();
  const riders = useRiders();
  const dispatch = useDispatchOrder(order.id);
  const [chosen, setChosen] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const canDispatch = order.status === 'confirmed';
  const available = riders.data?.filter((rider) => rider.status === 'available') ?? [];
  const riderId = order.delivery ? order.delivery.rider.id : (chosen ?? available[0]?.id ?? null);
  const rider =
    order.delivery?.rider ?? riders.data?.find((candidate) => candidate.id === riderId) ?? null;
  const firstName = rider?.name.split(' ')[0] ?? 'rider';
  const status = ORDER_STATUS[order.status];

  function handOver() {
    if (!riderId || !canDispatch) return;
    setFailure(null);
    dispatch.mutate(riderId, {
      onSuccess: () => {
        router.push(DCFP_PATHS.dispatch);
      },
      onError: (error) => {
        setFailure(getErrorMessage(error));
      },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={`Dispatch ${order.id} to ${order.hotspot.name}`}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description="The rider carries the condoms and the delivery note. The hotspot signs the note on arrival."
      />

      {canDispatch ? null : (
        <Alert variant="info">
          <AlertTitle>{order.delivery ? 'Already dispatched' : 'Not ready to dispatch'}</AlertTitle>
          <AlertDescription>
            {order.delivery ? (
              `${order.id} is with ${order.delivery.rider.name} on ${order.delivery.note_number}.`
            ) : (
              <>
                {order.id} is {status.label.toLowerCase()}: only confirmed orders can be handed to a
                rider. <Link href={DCFP_PATHS.order(order.id)}>Open the order</Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign a rider</CardTitle>
              <CardDescription>Only riders who are available can be chosen.</CardDescription>
            </CardHeader>
            <CardContent>
              {riders.isPending ? (
                <div className="flex flex-col gap-2" role="status">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <span className="sr-only">Loading riders…</span>
                </div>
              ) : riders.isError ? (
                <div className="flex flex-col items-start gap-2" role="alert">
                  <p className="text-destructive text-sm">
                    Could not load riders: {getErrorMessage(riders.error)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void riders.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : riders.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">No riders are registered yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <RadioCardGroup
                    legend="Rider"
                    hideLegend
                    value={riderId}
                    onValueChange={setChosen}
                    disabled={!canDispatch || dispatch.isPending}
                    options={riders.data.map((candidate) => ({
                      value: candidate.id,
                      label: candidate.name,
                      description: `${candidate.plate} · ${candidate.phone}`,
                      aside: (
                        <StatusBadge
                          status={RIDER_STATUS[candidate.status].label}
                          tone={RIDER_STATUS[candidate.status].tone}
                        />
                      ),
                      disabled: candidate.status !== 'available',
                    }))}
                  />
                  {canDispatch && available.length === 0 ? (
                    <p className="text-warning text-sm">
                      No rider is available right now. Try again when one is back.
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hand over</CardTitle>
              <CardDescription>
                Print two copies: one travels with the rider for the hotspot to sign, one stays at
                the store.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {failure ? (
                <Alert variant="destructive">
                  <AlertTitle>The order was not handed over</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    window.print();
                  }}
                >
                  <Printer data-icon="inline-start" />
                  Print delivery note
                </Button>
                {canDispatch ? (
                  <Button onClick={handOver} disabled={!riderId || dispatch.isPending}>
                    {dispatch.isPending ? 'Handing over…' : `Hand over to ${firstName}`}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <DeliveryNote order={order} riderName={rider?.name ?? null} />
      </div>
    </div>
  );
}

interface DeliveryNoteProps {
  order: HotspotOrder;
  riderName: string | null;
}

/** The delivery note as it prints: who it goes to, the batches, and the signature lines. */
function DeliveryNote({ order, riderName }: DeliveryNoteProps) {
  const { hotspot } = order;
  const place = [placeOf(hotspot), hotspot.district].filter(Boolean).join(', ');
  const contact = [hotspot.contact_name, hotspot.contact_phone].filter(Boolean).join(' · ');
  return (
    <Card
      className="min-w-0"
      role="region"
      aria-labelledby="delivery-note-heading"
      data-print-region
    >
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs">
              Ministry of Health{hotspot.district ? ` · ${hotspot.district} district store` : ''}
            </p>
            <h2 id="delivery-note-heading" className="text-base font-bold tracking-wide uppercase">
              Delivery note
            </h2>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-medium">
              {order.delivery?.note_number ?? 'Number assigned at hand-over'}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDate(order.delivery?.assigned_at ?? new Date().toISOString())}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Deliver to</p>
            <p className="font-medium break-words">{hotspot.name}</p>
            {place ? <p className="text-sm">{place}</p> : null}
            {contact ? <p className="text-muted-foreground text-sm">{contact}</p> : null}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Order</dt>
            <dd className="font-medium">{order.id}</dd>
            <dt className="text-muted-foreground">Rider</dt>
            <dd className="font-medium">{riderName ?? '—'}</dd>
          </dl>
        </div>

        <div className="-mx-(--card-spacing)">
          <ItemsTable<BatchLine>
            label="Items on the delivery note"
            rows={order.allocation}
            getRowId={(line) => `${line.product}:${line.batch}`}
            emptyText="No batches have been allocated to this order."
            columns={[
              {
                id: 'item',
                header: 'Item',
                cell: (line) => {
                  const { name, brand } = productOf(line.product);
                  return `${name} · ${brand}`;
                },
              },
              { id: 'batch', header: 'Batch', cell: (line) => line.batch },
              { id: 'expires', header: 'Expires', cell: (line) => formatDate(line.expires_on) },
              {
                id: 'pieces',
                header: 'Pieces',
                numeric: true,
                cell: (line) => formatNumber(line.quantity),
              },
            ]}
          />
        </div>

        <div className="grid gap-6 pt-6 sm:grid-cols-3">
          {[
            'Issued by · district store',
            `Delivered by · ${riderName ?? 'rider'}`,
            'Received by · name, signature, date',
          ].map((line) => (
            <div key={line} className="flex flex-col gap-1.5">
              <div className="border-foreground/40 h-8 border-b" aria-hidden="true" />
              <p className="text-muted-foreground text-xs">{line}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
