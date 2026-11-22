'use client';

import { FileQuestion } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { ItemsTable } from '@/components/ItemsTable';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { RecordView } from '@/components/RecordView';
import { EmptyState } from '@/components/states/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WriteAction } from '@/components/WriteAction';
import { useHotspot } from '@/features/hotspots/queries';
import { useFocusWhenLost } from '@/hooks/useFocusWhenLost';
import { formatNumber, formatText, formatTimestamp } from '@/lib/format';
import { useReadOnly } from '@/navigation/useAccess';

import type { Order, OrderEvent, StockBalance } from './api';
import { AskWarehouseForm } from './AskWarehouseForm';
import { orderHistory } from './history';
import { HotspotSupply } from './HotspotSupply';
import type { DistrictNames } from './names';
import { availableFor, formatQuantity, kindOf, requestFor } from './orders';
import { AlertStatusBadge, Loaded, RequestStatusBadge, useMe } from './parts';
import {
  useDistrictNames,
  useOrder,
  useOrderEvents,
  useOrders,
  useRiders,
  useStock,
} from './queries';
import { SendFromStoreForm } from './SendFromStoreForm';
import { DCFP_PATHS } from './tasks';

export default function AlertPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  return (
    <RecordView
      query={order}
      layout="detail"
      noun="stockout alert"
      back={{ href: DCFP_PATHS.queue, label: 'Back to the alerts' }}
    >
      {(data) =>
        kindOf(data) === 'alert' ? <AlertView alert={data} /> : <NotAnAlert order={data} />
      }
    </RecordView>
  );
}

/** An order id that is a warehouse request, or a legacy store order, opened at the alert address. */
function NotAnAlert({ order }: { order: Order }) {
  const isRequest = kindOf(order) === 'request';
  return (
    <div className="bg-card rounded-card border">
      <EmptyState
        icon={FileQuestion}
        title={isRequest ? 'This is a warehouse request' : 'This order is not a stockout alert'}
        description={
          isRequest
            ? 'It restocks the district store for an alert. Open it on the restock page.'
            : 'It comes from the older store ordering, which these screens do not show.'
        }
        action={
          <Button asChild variant="outline">
            <Link href={isRequest ? DCFP_PATHS.request(order.id) : DCFP_PATHS.queue}>
              {isRequest ? 'Open the request' : 'Back to the alerts'}
            </Link>
          </Button>
        }
      />
    </div>
  );
}

function AlertView({ alert }: { alert: Order }) {
  const now = new Date();
  const me = useMe();
  const { names, isPending: namesPending } = useDistrictNames();
  const events = useOrderEvents(alert.id);
  const stock = useStock();
  const hotspot = names.hotspot(alert.hot_spot_id);
  const product = names.product(alert.condom_id);
  // A DCFP reads their own store only; anyone reading every store sees this alert's.
  const productStock = (stock.data ?? []).filter(
    (row) => row.store_id === alert.ordered_from_store_id && row.condom_id === alert.condom_id,
  );

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={namesPending ? 'Stockout alert' : hotspot}
        status={<AlertStatusBadge status={alert.order_status} />}
        description={`${namesPending ? '…' : product} · reported ${formatTimestamp(alert.created_at, now)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Decision
            alert={alert}
            names={names}
            events={events.data}
            stock={productStock}
            stockLoad={stock}
          />

          <Card>
            <CardHeader>
              <CardTitle>District store stock</CardTitle>
              <CardDescription>{product}, by unit</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Loaded
                isPending={stock.isPending}
                error={stock.error}
                errorTitle="Could not load the district store"
                onRetry={() => void stock.refetch()}
                isRetrying={stock.isRefetching}
              >
                <StockTable rows={productStock} />
              </Loaded>
            </CardContent>
          </Card>

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
                  entries={orderHistory('alert', events.data ?? [], me.id, (iso) =>
                    formatTimestamp(iso, now),
                  )}
                />
              </Loaded>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Report</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: 'Product', value: product },
                  { label: 'Reported', value: formatTimestamp(alert.created_at, now) },
                  {
                    label: 'Comment',
                    value: (
                      <span className="wrap-anywhere whitespace-pre-line">
                        {formatText(alert.comment)}
                      </span>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
          {alert.hot_spot_id ? (
            <HotspotCard hotspotId={alert.hot_spot_id} condomId={alert.condom_id} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StockTable({ rows }: { rows: readonly StockBalance[] }) {
  return (
    <ItemsTable
      label="District store stock of this product"
      rows={rows}
      getRowId={(row) => row.unit_of_measure_id}
      emptyText="The district store holds none of this product."
      columns={[
        { id: 'unit', header: 'Unit', cell: (row) => row.unit },
        {
          id: 'on-hand',
          header: 'On hand',
          numeric: true,
          cell: (row) => formatNumber(row.on_hand),
        },
        {
          id: 'reserved',
          header: 'Reserved',
          numeric: true,
          cell: (row) => formatNumber(row.reserved),
        },
        {
          id: 'available',
          header: 'Available',
          numeric: true,
          cell: (row) => <span className="font-medium">{formatNumber(row.available)}</span>,
        },
        {
          id: 'incoming',
          header: 'Incoming',
          numeric: true,
          cell: (row) => formatNumber(row.incoming),
        },
      ]}
    />
  );
}

type Choice = 'send' | 'ask';

interface DecisionProps {
  alert: Order;
  names: DistrictNames;
  events: readonly OrderEvent[] | undefined;
  /** The district store's balances of the alert's product. */
  stock: readonly StockBalance[];
  stockLoad: { isPending: boolean; error: unknown; refetch: () => unknown; isRefetching: boolean };
}

/**
 * What the DCFP does about the alert while it waits (send from the store, or
 * ask the warehouse), and what came of it once they have.
 */
function Decision({ alert, names, events, stock, stockLoad }: DecisionProps) {
  const readOnly = useReadOnly();
  const orders = useOrders(null);
  const request = orders.data ? requestFor(alert.id, orders.data.items) : null;
  const openRequest = request && request.order_status !== 'received' ? request : null;
  const isOpen = alert.order_status === 'queued' || alert.order_status === 'on_hold';
  const available = availableFor(stock, alert.condom_id);
  // Sending, or asking, replaces the form with its outcome; focus follows it there.
  const outcomeRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(outcomeRef, alert.order_status);

  return (
    <Card ref={outcomeRef} tabIndex={-1} className="outline-none">
      <CardHeader>
        <CardTitle>{isOpen && !readOnly ? 'Decide' : 'Outcome'}</CardTitle>
        <CardDescription>
          {isOpen
            ? 'Send stock from the district store with a rider, or ask a national warehouse for it.'
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {alert.order_status === 'on_hold' ? (
          <RequestSummary request={request} names={names} isPending={orders.isPending} />
        ) : null}
        {alert.order_status === 'dispatched' || alert.order_status === 'delivered' ? (
          <SentSummary alert={alert} names={names} events={events} />
        ) : null}
        {isOpen ? (
          <WriteAction>
            <Loaded
              isPending={stockLoad.isPending}
              error={stockLoad.error}
              errorTitle="Could not load the district store"
              onRetry={() => void stockLoad.refetch()}
              isRetrying={stockLoad.isRefetching}
            >
              <DecisionForms
                // A new balance or request can change which choices are open.
                key={`${String(available > 0)}-${openRequest?.id ?? 'none'}`}
                alertId={alert.id}
                stock={stock}
                available={available}
                hasOpenRequest={openRequest !== null}
              />
            </Loaded>
          </WriteAction>
        ) : null}
        {alert.order_status === 'queued' && readOnly ? (
          <p className="text-muted-foreground text-sm">Waiting for the district focal person.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface DecisionFormsProps {
  alertId: string;
  stock: readonly StockBalance[];
  available: number;
  hasOpenRequest: boolean;
}

function DecisionForms({ alertId, stock, available, hasOpenRequest }: DecisionFormsProps) {
  const canSend = available > 0;
  const [choice, setChoice] = useState<Choice | null>(
    canSend ? 'send' : hasOpenRequest ? null : 'ask',
  );
  if (!canSend && hasOpenRequest) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing of this product is available to send yet. Receive the warehouse&apos;s shipment when
        it arrives, then send it from here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <RadioCardGroup<Choice>
        legend="How will you supply this hotspot?"
        layout="row"
        value={choice}
        onValueChange={setChoice}
        options={[
          {
            value: 'send',
            label: 'Send from the district store',
            description: canSend
              ? `${formatNumber(available)} available in all units`
              : 'None available in the district store now',
            disabled: !canSend,
          },
          {
            value: 'ask',
            label: 'Ask the warehouse',
            description: hasOpenRequest
              ? 'A request for this alert is already open'
              : 'The alert waits on hold until the stock arrives',
            disabled: hasOpenRequest,
          },
        ]}
      />
      {choice === 'send' ? <SendFromStoreForm alertId={alertId} stock={stock} /> : null}
      {choice === 'ask' ? <AskWarehouseForm alertId={alertId} /> : null}
    </div>
  );
}

function RequestSummary({
  request,
  names,
  isPending,
}: {
  request: Order | null;
  names: DistrictNames;
  isPending: boolean;
}) {
  if (isPending) return null;
  if (!request) {
    return (
      <p className="text-muted-foreground text-sm">
        Waiting for the warehouse. The request for this alert is not in the newest orders.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <DetailList
        variant="grid"
        items={[
          {
            label: 'Warehouse request',
            value: <RequestStatusBadge status={request.order_status} />,
          },
          { label: 'Asked of', value: names.store(request.ordered_from_store_id) },
          {
            label: 'Asked for',
            value: formatQuantity(request.quantity_needed, names.unit(request.unit_of_measure_id)),
          },
          ...(request.quantity_issued === null
            ? []
            : [
                {
                  label: 'Sent by the warehouse',
                  value: formatQuantity(
                    request.quantity_issued,
                    names.unit(request.unit_of_measure_id),
                  ),
                },
              ]),
        ]}
      />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link href={DCFP_PATHS.request(request.id)}>
            {request.order_status === 'dispatched' ? 'Receive the shipment' : 'Open the request'}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function SentSummary({
  alert,
  names,
  events,
}: {
  alert: Order;
  names: DistrictNames;
  events: readonly OrderEvent[] | undefined;
}) {
  const riders = useRiders();
  const rider = riders.data?.find((candidate) => candidate.id === alert.rider_id);
  // Events come newest first, so the first match is the latest.
  const sentAt = events?.find((event) => event.action === 'dispatch')?.created_at ?? null;
  const deliveredAt = events?.find((event) => event.action === 'deliver')?.created_at ?? null;
  return (
    <DetailList
      variant="grid"
      items={[
        {
          label: 'Sent',
          value: formatQuantity(alert.quantity_issued, names.unit(alert.unit_of_measure_id)),
        },
        {
          label: 'Rider',
          value: rider
            ? `${rider.first_name} ${rider.last_name}${rider.phone_number ? ` · ${rider.phone_number}` : ''}`
            : 'A rider from your store',
        },
        { label: 'Sent at', value: formatTimestamp(sentAt) },
        ...(alert.order_status === 'delivered'
          ? [
              { label: 'Delivered at', value: formatTimestamp(deliveredAt) },
              {
                label: 'Delivery note',
                value: (
                  <span className="whitespace-pre-line">{formatText(alert.delivery_note)}</span>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

function HotspotCard({ hotspotId, condomId }: { hotspotId: string; condomId: string }) {
  const hotspot = useHotspot(hotspotId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hotspot</CardTitle>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={DCFP_PATHS.hotspot(hotspotId)}>Open hotspot</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {hotspot.error?.kind === 'not_found' ? (
          <p className="text-muted-foreground text-sm">
            This hotspot is no longer available to you.
          </p>
        ) : (
          <Loaded
            isPending={hotspot.isPending}
            error={hotspot.error}
            errorTitle="Could not load the hotspot"
            onRetry={() => void hotspot.refetch()}
            isRetrying={hotspot.isRefetching}
          >
            {hotspot.data ? (
              <DetailList
                items={[
                  { label: 'Type', value: formatText(hotspot.data.type) },
                  {
                    label: 'Place',
                    value:
                      [
                        hotspot.data.village,
                        hotspot.data.subcounty?.name,
                        hotspot.data.district?.name,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—',
                  },
                  {
                    label: 'Hotspot manager',
                    value: formatText(hotspot.data.contact_person?.name),
                  },
                  {
                    label: 'Phone',
                    value: hotspot.data.contact_person?.phone_number ? (
                      <a
                        href={`tel:${hotspot.data.contact_person.phone_number}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {hotspot.data.contact_person.phone_number}
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                ]}
              />
            ) : null}
          </Loaded>
        )}
        <div className="-mx-(--card-spacing) flex flex-col gap-2">
          <h3 className="px-(--card-spacing) text-sm font-medium">Supply of this product</h3>
          <HotspotSupply hotspotId={hotspotId} condomId={condomId} />
        </div>
      </CardContent>
    </Card>
  );
}
