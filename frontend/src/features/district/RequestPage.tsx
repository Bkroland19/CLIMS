'use client';

import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { RecordView } from '@/components/RecordView';
import { EmptyState } from '@/components/states/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WriteAction } from '@/components/WriteAction';
import { useFocusWhenLost } from '@/hooks/useFocusWhenLost';
import { formatText, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { Order } from './api';
import { orderHistory } from './history';
import type { DistrictNames } from './names';
import { formatQuantity, kindOf } from './orders';
import { AlertStatusBadge, Loaded, RequestStatusBadge, useMe } from './parts';
import { ReceiveForm } from './ReceiveForm';
import { useDistrictNames, useOrder, useOrderEvents } from './queries';
import { DCFP_PATHS } from './tasks';

export default function RequestPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  return (
    <RecordView
      query={order}
      layout="detail"
      noun="warehouse request"
      back={{ href: DCFP_PATHS.requests, label: 'Back to the warehouse requests' }}
    >
      {(data) =>
        kindOf(data) === 'request' ? <RequestView request={data} /> : <NotARequest order={data} />
      }
    </RecordView>
  );
}

function NotARequest({ order }: { order: Order }) {
  const isAlert = kindOf(order) === 'alert';
  return (
    <div className="bg-card rounded-card border">
      <EmptyState
        icon={FileQuestion}
        title={isAlert ? 'This is a stockout alert' : 'This order is not a warehouse request'}
        description={
          isAlert
            ? 'A hotspot ran out. Open it to send stock or ask the warehouse.'
            : 'It comes from the older store ordering, which these screens do not show.'
        }
        action={
          <Button asChild variant="outline">
            <Link href={isAlert ? DCFP_PATHS.alert(order.id) : DCFP_PATHS.requests}>
              {isAlert ? 'Open the alert' : 'Back to the warehouse requests'}
            </Link>
          </Button>
        }
      />
    </div>
  );
}

/** Where a request stands while it is with the warehouse, in the district's words. */
const WITH_WAREHOUSE: Partial<Record<Order['order_status'], string>> = {
  queued: 'The warehouse has not looked at it yet.',
  reviewed: 'The warehouse has reviewed it and will check its stock next.',
  confirmed: 'The warehouse has the stock and will ship it.',
  on_hold: 'The warehouse is short of this product. It ships once it has the stock.',
};

function RequestView({ request }: { request: Order }) {
  const now = new Date();
  const me = useMe();
  const { names, isPending: namesPending } = useDistrictNames();
  const events = useOrderEvents(request.id);
  const parent = useOrder(request.parent_order_id ?? '', {
    enabled: request.parent_order_id !== null,
  });
  const product = names.product(request.condom_id);
  const unit = names.unit(request.unit_of_measure_id);
  const warehouse = names.store(request.ordered_from_store_id);

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={namesPending ? 'Warehouse request' : `${product} from ${warehouse}`}
        status={<RequestStatusBadge status={request.order_status} />}
        description={`Asked for ${formatQuantity(request.quantity_needed, unit)} · sent ${formatTimestamp(request.created_at, now)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Receipt request={request} unit={unit} parent={parent.data ?? null} names={names} />

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <Loaded
                isPending={events.isPending}
                error={events.error}
                errorTitle="Could not load the history"
                onRetry={() => void events.refetch()}
                isRetrying={events.isRefetching}
              >
                <ActivityTimeline
                  entries={orderHistory('request', events.data ?? [], me.id, (iso) =>
                    formatTimestamp(iso, now),
                  )}
                />
              </Loaded>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: 'Product', value: product },
                { label: 'Warehouse', value: warehouse },
                { label: 'Asked for', value: formatQuantity(request.quantity_needed, unit) },
                {
                  label: 'Sent by the warehouse',
                  value:
                    request.quantity_issued === null
                      ? 'Not yet'
                      : formatQuantity(request.quantity_issued, unit),
                },
                {
                  label: 'For alert',
                  value: parent.data ? (
                    <span className="flex flex-col items-start gap-1">
                      <Link
                        href={DCFP_PATHS.alert(parent.data.id)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {names.hotspot(parent.data.hot_spot_id)}
                      </Link>
                      <AlertStatusBadge status={parent.data.order_status} />
                    </span>
                  ) : parent.isPending && request.parent_order_id ? (
                    '…'
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface ReceiptProps {
  request: Order;
  unit: string | null;
  /** The alert the request was made for, once loaded. */
  parent: Order | null;
  names: DistrictNames;
}

/** Receiving the shipment once it is on its way, and what was received after. */
function Receipt({ request, unit, parent, names }: ReceiptProps) {
  const readOnly = useReadOnly();
  // Receiving replaces the form with the receipt; focus follows it there.
  const cardRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(cardRef, request.order_status);
  const status = request.order_status;
  const canReceive = status === 'dispatched' && request.quantity_issued !== null;

  return (
    <Card ref={cardRef} tabIndex={-1} className="outline-none">
      <CardHeader>
        <CardTitle>{canReceive && !readOnly ? 'Receive the shipment' : 'Shipment'}</CardTitle>
        {canReceive ? (
          <CardDescription>
            {formatQuantity(request.quantity_issued, unit)} are on the way from{' '}
            {names.store(request.ordered_from_store_id)}. Record what arrives.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {WITH_WAREHOUSE[status] ? (
          <p className="text-muted-foreground text-sm">{WITH_WAREHOUSE[status]}</p>
        ) : null}
        {canReceive && request.quantity_issued !== null ? (
          <WriteAction>
            <ReceiveForm requestId={request.id} issued={request.quantity_issued} unit={unit} />
          </WriteAction>
        ) : null}
        {status === 'received' ? (
          <>
            <DetailList
              variant="grid"
              items={[
                { label: 'Received', value: formatQuantity(request.quantity_received, unit) },
                { label: 'Sent', value: formatQuantity(request.quantity_issued, unit) },
                {
                  label: 'Difference explained',
                  value: (
                    <span className="whitespace-pre-line">
                      {formatText(request.discrepancy_note)}
                    </span>
                  ),
                },
              ]}
            />
            {parent?.order_status === 'on_hold' ? (
              <WriteAction>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm">
                    The alert from {names.hotspot(parent.hot_spot_id)} is still waiting.
                  </p>
                  <Button asChild size="sm">
                    <Link href={DCFP_PATHS.alert(parent.id)}>Send the held alert</Link>
                  </Button>
                </div>
              </WriteAction>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
