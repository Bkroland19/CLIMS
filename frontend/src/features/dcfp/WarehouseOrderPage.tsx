'use client';

import { useParams } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';

import { ActivityTimeline, type ActivityEntry } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { TextField } from '@/components/form/TextField';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { StepTracker } from '@/components/StepTracker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WriteAction } from '@/components/WriteAction';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatTimestamp } from '@/lib/format';

import type { Order, OrderEvent } from './api';
import { eventLabel, ORDER_STATUS, orderSteps, parseCount, receiptErrors } from './orders';
import { useOrder, useOrderEvents, useReceiveOrder } from './queries';
import { useOrderNames, type OrderNames } from './useOrderNames';

export default function WarehouseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  const events = useOrderEvents(id);
  const names = useOrderNames();

  const failed = order.error ?? names.error;
  if (failed) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load this order"
          error={failed}
          onRetry={() => {
            void order.refetch();
            names.refetch();
          }}
          isRetrying={order.isRefetching}
        />
      </div>
    );
  }
  if (!order.data || names.isPending) return <PageSkeleton layout="detail" />;
  return <OrderDetail order={order.data} events={events.data} names={names} />;
}

/** Who acts at each step, for the history's role colour. */
const WAREHOUSE_STEPS = new Set(['review', 'check-stock', 'dispatch']);

function OrderDetail({
  order,
  events,
  names,
}: {
  order: Order;
  events: readonly OrderEvent[] | undefined;
  names: OrderNames;
}) {
  const status = ORDER_STATUS[order.order_status];
  const history: ActivityEntry[] = (events ?? []).map((event) => ({
    id: event.id,
    text: eventLabel(event.action, event.status),
    meta: formatTimestamp(event.created_at),
    role: WAREHOUSE_STEPS.has(event.action) ? 'warehouse' : 'dcfp',
  }));
  const differs =
    order.quantity_received !== null && order.quantity_received !== order.quantity_issued;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={`${names.product(order.condom_id, order.condom_category)} from ${names.warehouseLabel(order.ordered_from_store_id)}`}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`Ordered ${formatDate(order.order_date)}`}
      >
        <StepTracker aria-label="Order progress" steps={orderSteps(order.order_status)} />
      </DetailHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {order.order_status === 'dispatched' && order.quantity_issued !== null ? (
            <WriteAction>
              <ReceiveCard order={order} issued={order.quantity_issued} names={names} />
            </WriteAction>
          ) : null}
          {order.order_status === 'on_hold' ? (
            <Alert>
              <AlertTitle>Waiting for stock at the warehouse</AlertTitle>
              <AlertDescription>
                {names.warehouseLabel(order.ordered_from_store_id)} does not have enough of this
                product yet. It checks again when stock arrives; nothing is needed from you.
              </AlertDescription>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h3>History</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-sm">No steps recorded yet.</p>
              ) : (
                <ActivityTimeline entries={history} />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle asChild>
              <h3>Order</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: 'Product', value: names.product(order.condom_id, order.condom_category) },
                {
                  label: 'Ordered from',
                  value:
                    names.warehouse(order.ordered_from_store_id)?.name ??
                    names.warehouseLabel(order.ordered_from_store_id),
                },
                {
                  label: 'Quantity ordered',
                  value: names.quantity(order.quantity_needed, order.unit_of_measure_id),
                },
                {
                  label: 'Quantity dispatched',
                  value: names.quantity(order.quantity_issued, order.unit_of_measure_id),
                },
                {
                  label: 'Quantity received',
                  value: names.quantity(order.quantity_received, order.unit_of_measure_id),
                },
                ...(differs && order.discrepancy_note
                  ? [{ label: 'Why it differs', value: order.discrepancy_note }]
                  : []),
                { label: 'Comment', value: order.comment ?? '—' },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReceiveCard({
  order,
  issued,
  names,
}: {
  order: Order;
  issued: number;
  names: OrderNames;
}) {
  const receive = useReceiveOrder(order.id);
  const noteId = useId();
  const [quantity, setQuantity] = useState(String(issued));
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);

  const errors = receiptErrors(quantity, issued, note);
  const counted = parseCount(quantity);
  const differs = counted !== null && counted !== issued;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (receive.isPending || counted === null || errors.quantity || errors.note) return;
    receive.mutate({
      quantity_received: counted,
      ...(differs ? { discrepancy_note: note.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h3>Record the receipt</h3>
        </CardTitle>
        <CardDescription>
          {names.warehouseLabel(order.ordered_from_store_id)} dispatched{' '}
          {names.quantity(issued, order.unit_of_measure_id)}. Count what arrived; the counted
          quantity is added to the district store.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Quantity counted"
            required
            inputMode="numeric"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
            error={attempted ? errors.quantity : undefined}
            disabled={receive.isPending}
            className="max-w-40 tabular-nums"
          />
          {differs ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={noteId}>Why the count differs</Label>
              <Textarea
                id={noteId}
                rows={3}
                maxLength={4000}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                aria-invalid={attempted && errors.note ? true : undefined}
                aria-describedby={attempted && errors.note ? `${noteId}-error` : undefined}
                placeholder="e.g. One carton was damaged in transit"
                disabled={receive.isPending}
              />
              {attempted && errors.note ? (
                <p id={`${noteId}-error`} className="text-destructive text-sm">
                  {errors.note}
                </p>
              ) : null}
            </div>
          ) : null}
          {receive.error ? (
            <Alert variant="destructive">
              <AlertTitle>The receipt was not recorded</AlertTitle>
              <AlertDescription>{getErrorMessage(receive.error)}</AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Button type="submit" disabled={receive.isPending}>
              {receive.isPending ? 'Recording…' : 'Record receipt'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
