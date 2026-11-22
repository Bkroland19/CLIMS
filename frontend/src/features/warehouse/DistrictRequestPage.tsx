'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { ItemsTable } from '@/components/ItemsTable';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { SampleDataNotice } from '@/components/SampleData';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { StepTracker } from '@/components/StepTracker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { historyOf, timelineEntries } from '@/features/fulfilment/activity';
import type { WarehouseCode, WarehouseRequest } from '@/features/fulfilment/api';
import { expiryOf, MIN_SHELF_MONTHS } from '@/features/fulfilment/batches';
import { ExpiryCell, ProductCell } from '@/features/fulfilment/BatchCells';
import type { PickEntries } from '@/features/fulfilment/picking';
import { formatQuantities, PRODUCTS, type ProductKey } from '@/features/fulfilment/products';
import { RecordView } from '@/components/RecordView';
import { REQUEST_STATUS } from '@/features/fulfilment/status';
import { StockCheckBadge } from '@/features/inventory/StockCheckBadge';
import { useFocusWhenLost } from '@/hooks/useFocusWhenLost';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { WriteAction } from '@/components/WriteAction';
import { useReadOnly } from '@/navigation/useAccess';

import type { WarehouseStock } from './api';
import { BATCH_STATUS, checkRequestStock, dispatchableStock, planDispatch } from './dispatch';
import { DispatchPicker } from './DispatchPicker';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { isNew, requestBanner, warehouseSteps } from './progress';
import {
  useAcceptWarehouseRequest,
  useDispatchWarehouseRequest,
  useHoldWarehouseRequest,
  useOpenWarehouseRequest,
  useRequeueWarehouseRequest,
  useWarehouseActivity,
  useWarehouseRequest,
  useWarehouseStock,
} from './queries';
import { StoreSwitch } from './StoreSwitch';
import { useWarehouseStore } from './useWarehouseStore';

/** Why a warehouse holds a request, as the prototype offers them. */
export const HOLD_REASONS = [
  'Awaiting supplier delivery',
  'Stock committed to other districts',
  'Batch on quality hold',
] as const;

type HoldReason = (typeof HOLD_REASONS)[number];

/** The writes this page makes, to show a failure next to the one that failed. */
type Action = 'accept' | 'requeue' | 'hold' | 'dispatch';

export default function DistrictRequestPage() {
  const { id } = useParams<{ id: string }>();
  const { store, href } = useWarehouseStore();
  const request = useWarehouseRequest(store, id);
  // Each action replaces the button that did it (the detail remounts per
  // status); focus goes to the banner that says what is true now.
  const bannerRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(bannerRef, request.data?.status);
  return (
    <div className="flex flex-col gap-4">
      <StoreSwitch store={store} hrefFor={(code) => withStore(WAREHOUSE_PATHS.requests, code)} />
      <SampleDataNotice subject="The request and stock figures" />
      <RecordView
        query={request}
        layout="detail"
        noun={`request at ${store}`}
        back={{ href: href(WAREHOUSE_PATHS.requests), label: 'Back to district requests' }}
      >
        {/* Keyed on the status: a stock check or half-typed form never outlives the step it was for. */}
        {(data) => (
          <RequestDetail
            key={`${data.id}:${data.status}`}
            request={data}
            store={store}
            bannerRef={bannerRef}
          />
        )}
      </RecordView>
    </div>
  );
}

interface DispatchFields {
  waybill: string;
  vehicle: string;
  driver: string;
}

const FIELD_LABELS: Record<keyof DispatchFields, string> = {
  waybill: 'Waybill number',
  vehicle: 'Vehicle',
  driver: 'Driver',
};

const FIELD_ERRORS: Record<keyof DispatchFields, string> = {
  waybill: 'Enter the waybill number.',
  vehicle: 'Enter the vehicle registration.',
  driver: "Enter the driver's name.",
};

interface RequestDetailProps {
  request: WarehouseRequest;
  store: WarehouseCode;
  /** The status banner, focused after an action changes the status. */
  bannerRef: RefObject<HTMLDivElement | null>;
}

function RequestDetail({ request, store, bannerRef }: RequestDetailProps) {
  const now = new Date();
  const stock = useWarehouseStock(store);
  const activity = useWarehouseActivity(store);
  const open = useOpenWarehouseRequest(store, request.id);
  const accept = useAcceptWarehouseRequest(store);
  const hold = useHoldWarehouseRequest(store, request.id, request.district);
  const requeue = useRequeueWarehouseRequest(store, request.id);
  const dispatch = useDispatchWarehouseRequest(store, request.id, request.district);

  const [checked, setChecked] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [reason, setReason] = useState<HoldReason | null>(null);
  const [holdTried, setHoldTried] = useState(false);
  const [fields, setFields] = useState<DispatchFields>({ waybill: '', vehicle: '', driver: '' });
  const [dispatchTried, setDispatchTried] = useState(false);
  const [entries, setEntries] = useState<PickEntries>({});
  const [failure, setFailure] = useState<{ action: Action; message: string } | null>(null);

  // "Put on hold instead" removes itself; carry focus to the reasons it reveals.
  const holdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showHold) holdRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
  }, [showHold]);

  // Opening a new request tells the district it is being looked at, once.
  const opened = useRef(false);
  const { mutate: markOpened } = open;
  useEffect(() => {
    if (request.status !== 'sent' || opened.current) return;
    opened.current = true;
    markOpened(undefined);
  }, [request.status, markOpened]);

  const isQueued = request.status === 'queued';
  const check =
    isQueued && checked && stock.data
      ? checkRequestStock(request.items, stock.data.batches, now)
      : null;
  const plan =
    check?.isAvailable && stock.data
      ? planDispatch(stock.data.batches, request.items, entries, now)
      : null;
  const fieldErrors = (Object.keys(fields) as (keyof DispatchFields)[]).filter(
    (field) => fields[field].trim() === '',
  );
  const isBusy = accept.isPending || hold.isPending || requeue.isPending || dispatch.isPending;
  const failed = (action: Action) => (error: unknown) => {
    setFailure({ action, message: getErrorMessage(error) });
  };
  /** The failure of `action`, shown next to the button that tried it. */
  const failureOf = (action: Action) =>
    failure?.action === action ? (
      <Alert variant="destructive">
        <AlertTitle>That did not go through</AlertTitle>
        <AlertDescription>{failure.message}</AlertDescription>
      </Alert>
    ) : null;

  function submitHold() {
    setHoldTried(true);
    setFailure(null);
    if (!reason) return;
    hold.mutate({ reason }, { onError: failed('hold') });
  }

  function submitDispatch() {
    setDispatchTried(true);
    setFailure(null);
    const [firstError] = fieldErrors;
    if (firstError) {
      // Focus once the attempt has rendered the errors, so the field is
      // invalid and described when focus lands on it.
      requestAnimationFrame(() => document.getElementById(`dispatch-${firstError}`)?.focus());
      return;
    }
    if (!plan || plan.problems.length > 0) return;
    dispatch.mutate(
      {
        waybill: fields.waybill.trim(),
        vehicle: fields.vehicle.trim(),
        driver: fields.driver.trim(),
        lines: plan.lines,
      },
      { onError: failed('dispatch') },
    );
  }

  const status = REQUEST_STATUS[request.status];
  const banner = requestBanner(request, check, now);
  const history = activity.data ? historyOf(activity.data, [request.id]) : [];

  return (
    <div className="gap-section flex flex-col">
      <DetailHeader
        title={request.id}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`${request.district} district store · received ${formatTimestamp(request.created_at, now)}`}
      >
        <StepTracker aria-label="Request progress" steps={warehouseSteps(request, check, now)} />
      </DetailHeader>

      <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="gap-section flex min-w-0 flex-col">
          <Alert ref={bannerRef} tabIndex={-1} variant={banner.variant} role="status">
            <AlertTitle>{banner.title}</AlertTitle>
            <AlertDescription>{banner.body}</AlertDescription>
          </Alert>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                In pieces. Stock shown is what is held at {store} now.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <ItemsTable<ProductKey>
                label="Items"
                rows={PRODUCTS.map((product) => product.key)}
                getRowId={(key) => key}
                columns={[
                  {
                    id: 'product',
                    header: 'Product',
                    cell: (key) => <ProductCell product={key} />,
                  },
                  {
                    id: 'needed',
                    header: 'Needed',
                    numeric: true,
                    cell: (key) => formatNumber(request.items[key]),
                  },
                  {
                    id: 'in-stock',
                    header: `In stock at ${store}`,
                    cell: (key) => <InStockCell stock={stock.data} product={key} now={now} />,
                  },
                  {
                    id: 'check',
                    header: 'Stock check',
                    cell: (key) => <StockCheckBadge check={check ? check.checks[key] : null} />,
                  },
                  {
                    id: 'issued',
                    header: 'Issued',
                    numeric: true,
                    cell: (key) =>
                      request.dispatch ? formatNumber(request.dispatch.items[key]) : '—',
                  },
                ]}
              />
              <div className="flex flex-col gap-3 px-(--card-spacing)">
                {stock.isError ? (
                  <p className="text-destructive text-sm" role="alert">
                    Could not load {store} stock: {getErrorMessage(stock.error)}
                  </p>
                ) : null}
                {failureOf('accept')}
                {failureOf('requeue')}
                <RequestActions
                  request={request}
                  hasCheck={check !== null}
                  canCheck={stock.data !== undefined}
                  isBusy={isBusy}
                  pending={accept.isPending ? 'accept' : requeue.isPending ? 'requeue' : null}
                  onAccept={() => {
                    setFailure(null);
                    accept.mutate(request.id, { onError: failed('accept') });
                  }}
                  onCheck={() => {
                    setFailure(null);
                    setChecked(true);
                  }}
                  onRequeue={() => {
                    setFailure(null);
                    requeue.mutate(undefined, { onError: failed('requeue') });
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {plan ? (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Dispatch stock</CardTitle>
                <CardDescription>
                  Pick batches, record transport, then dispatch. Each batch picked prints as a line
                  on the waybill.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  {(Object.keys(FIELD_LABELS) as (keyof DispatchFields)[]).map((field) => {
                    const inputId = `dispatch-${field}`;
                    const error =
                      dispatchTried && fieldErrors.includes(field) ? FIELD_ERRORS[field] : null;
                    return (
                      <div key={field} className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor={inputId}>{FIELD_LABELS[field]}</Label>
                        <Input
                          id={inputId}
                          value={fields[field]}
                          onChange={(event) => {
                            setFields((current) => ({ ...current, [field]: event.target.value }));
                          }}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? `${inputId}-error` : undefined}
                          disabled={isBusy}
                          autoComplete="off"
                        />
                        {error ? (
                          <FieldError id={`${inputId}-error`} className="text-xs">
                            {error}
                          </FieldError>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <DispatchPicker
                  groups={plan.groups}
                  now={now}
                  disabled={isBusy}
                  onPick={(key, text) => {
                    setEntries((current) => ({ ...current, [key]: text }));
                  }}
                />
                {plan.problems.length > 0 ? (
                  <Alert variant="destructive" role="status">
                    <AlertDescription>{plan.problems.join(' · ')}.</AlertDescription>
                  </Alert>
                ) : plan.isPartial ? (
                  <Alert variant="warning" role="status">
                    <AlertDescription>
                      You are issuing less than was needed. The district will see the difference on
                      the waybill.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {failureOf('dispatch')}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  {showHold ? null : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowHold(true);
                      }}
                      disabled={isBusy}
                    >
                      Put on hold instead
                    </Button>
                  )}
                  <WriteAction>
                    <Button onClick={submitDispatch} disabled={isBusy || plan.problems.length > 0}>
                      {dispatch.isPending
                        ? 'Dispatching…'
                        : `Dispatch to ${request.district} district store`}
                    </Button>
                  </WriteAction>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {(check && !check.isAvailable) || (plan && showHold) ? (
            <Card ref={holdRef} className="min-w-0">
              <CardHeader>
                <CardTitle>Put request on hold</CardTitle>
                <CardDescription>
                  The district is notified and the request returns to the queue when stock is
                  re-checked.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <RadioCardGroup
                  legend="Reason"
                  options={HOLD_REASONS.map((value) => ({ value, label: value }))}
                  value={reason}
                  onValueChange={setReason}
                  disabled={isBusy}
                  error={holdTried && !reason ? 'Choose a reason for the hold.' : undefined}
                />
                {failureOf('hold')}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <WriteAction>
                    <Button onClick={submitHold} disabled={isBusy}>
                      {hold.isPending ? 'Putting on hold…' : 'Put on hold and notify district'}
                    </Button>
                  </WriteAction>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {request.dispatch ? <WaybillCard dispatch={request.dispatch} now={now} /> : null}
          {request.receipt ? <ReceiptCard request={request} now={now} /> : null}
        </div>

        <div className="gap-section flex min-w-0 flex-col">
          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: 'Ordered for', value: `${request.district} district store` },
                  { label: 'Ordered by', value: request.requested_by },
                  {
                    label: 'Hotspot orders waiting',
                    value:
                      request.linked_orders.length > 0
                        ? formatNumber(request.linked_orders.length)
                        : 'None',
                  },
                  { label: 'Comment', value: request.note ?? '—' },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Full history, oldest first</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.isPending ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : activity.isError ? (
                <ErrorState
                  title="Could not load the activity"
                  error={activity.error}
                  onRetry={() => void activity.refetch()}
                  isRetrying={activity.isRefetching}
                />
              ) : history.length === 0 ? (
                <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
              ) : (
                <ActivityTimeline entries={timelineEntries(history, { now })} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Pieces held at the warehouse, over how many of them have the minimum shelf life left. */
function InStockCell({
  stock,
  product,
  now,
}: {
  stock: WarehouseStock | undefined;
  product: ProductKey;
  now: Date;
}) {
  if (!stock) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div className="tabular-nums">{formatNumber(stock.stock[product])}</div>
      <div className="text-muted-foreground text-xs">
        {formatNumber(dispatchableStock(stock.batches, now)[product])} with {MIN_SHELF_MONTHS}+
        months
      </div>
    </div>
  );
}

interface RequestActionsProps {
  request: WarehouseRequest;
  hasCheck: boolean;
  canCheck: boolean;
  isBusy: boolean;
  pending: 'accept' | 'requeue' | null;
  onAccept: () => void;
  onCheck: () => void;
  onRequeue: () => void;
}

function RequestActions({
  request,
  hasCheck,
  canCheck,
  isBusy,
  pending,
  onAccept,
  onCheck,
  onRequeue,
}: RequestActionsProps) {
  // Accepting, checking and re-queueing all move the request on; read-only viewers do none.
  const readOnly = useReadOnly();
  let button = null;
  if (isNew(request)) {
    button = (
      <Button onClick={onAccept} disabled={isBusy}>
        {pending === 'accept' ? 'Accepting…' : 'Accept and queue request'}
      </Button>
    );
  } else if (request.status === 'queued') {
    button = (
      <Button
        variant={hasCheck ? 'outline' : 'default'}
        onClick={onCheck}
        disabled={!canCheck || isBusy}
      >
        {hasCheck ? 'Check again' : 'Check stock'}
      </Button>
    );
  } else if (request.status === 'on_hold') {
    button = (
      <Button onClick={onRequeue} disabled={isBusy}>
        {pending === 'requeue' ? 'Returning…' : 'Return to queue and re-check'}
      </Button>
    );
  }
  if (readOnly || !button) return null;
  return <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{button}</div>;
}

function WaybillCard({
  dispatch,
  now,
}: {
  dispatch: NonNullable<WarehouseRequest['dispatch']>;
  now: Date;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Waybill {dispatch.waybill}</CardTitle>
        <CardDescription>
          {dispatch.vehicle} · {dispatch.driver} · dispatched{' '}
          {formatTimestamp(dispatch.dispatched_at, now)}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ItemsTable
          label={`Waybill ${dispatch.waybill}`}
          rows={dispatch.lines}
          getRowId={(line) => `${line.product}:${line.batch}`}
          emptyText="No batch lines on this waybill."
          columns={[
            {
              id: 'product',
              header: 'Product',
              cell: (line) => <ProductCell product={line.product} />,
            },
            { id: 'batch', header: 'Batch', cell: (line) => line.batch },
            {
              id: 'manufactured',
              header: 'Manufactured',
              cell: (line) => formatDate(line.manufactured_on),
            },
            {
              id: 'expires',
              header: 'Expires',
              cell: (line) => <ExpiryCell expiresOn={line.expires_on} now={now} />,
            },
            {
              id: 'pieces',
              header: 'Pieces',
              numeric: true,
              cell: (line) => formatNumber(line.quantity),
            },
            {
              id: 'shelf',
              header: 'Shelf life',
              cell: (line) => {
                const shown = BATCH_STATUS[expiryOf(line.expires_on, now).state];
                return <StatusBadge status={shown.label} tone={shown.tone} />;
              },
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ReceiptCard({ request, now }: { request: WarehouseRequest; now: Date }) {
  const { receipt } = request;
  if (!receipt) return null;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Received by {request.district}</CardTitle>
        <CardDescription>What the district counted and accepted into its store.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DetailList
          variant="grid"
          items={[
            { label: 'Goods received note', value: receipt.grn },
            { label: 'Received by', value: receipt.received_by },
            { label: 'Received', value: formatTimestamp(receipt.received_at, now) },
            { label: 'Accepted', value: formatQuantities(receipt.accepted) },
          ]}
        />
        {receipt.discrepancy ? (
          <Alert variant="warning">
            <AlertTitle>Discrepancy: {receipt.discrepancy.type}</AlertTitle>
            <AlertDescription>{receipt.discrepancy.note}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
