'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState, type Ref } from 'react';

import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { InlineMessage } from '@/components/InlineMessage';
import { ItemsTable } from '@/components/ItemsTable';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { StepTracker } from '@/components/StepTracker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StockCheckBadge } from '@/features/inventory/StockCheckBadge';
import { useFocusWhenLost } from '@/hooks/useFocusWhenLost';
import { checkStock } from '@/features/inventory/stockCheck';
import { getErrorMessage } from '@/lib/api';
import { formatNumber, formatTimestamp } from '@/lib/format';

import type { DistrictStore, HotspotOrder, WarehouseRequest } from './api';
import { expiryOf, NEAR_EXPIRY_MONTHS } from './batches';
import { BatchStatusBadge, ExpiryCell, ProductCell } from './BatchCells';
import { BatchPicker } from './BatchPicker';
import { HistoryCard } from './HistoryCard';
import { planPicks, type PickEntries } from './picking';
import { orderSteps, type CheckResult } from './progress';
import {
  covers,
  formatQuantities,
  parsePieces,
  PRODUCTS,
  productOf,
  type ProductKey,
  type Quantities,
} from './products';
import {
  useConfirmOrder,
  useDistrictStore,
  useHoldOrder,
  useOrder,
  useReleaseOrder,
  useRequests,
} from './queries';
import { RecordView } from '@/components/RecordView';
import { useReadOnly } from '@/navigation/useAccess';
import { ORDER_STATUS, REQUEST_STATUS } from './status';
import { DCFP_PATHS } from './tasks';

const HOLD_SHORT = 'Not enough stock in the district store';
const HOLD_BY_CHOICE = 'Held by the district focal person';

export default function OrderReviewPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The order and stock figures" />
      <RecordView
        query={order}
        layout="detail"
        noun="order"
        back={{ href: DCFP_PATHS.queue, label: 'Back to the order queue' }}
      >
        {(data) => <OrderReview order={data} />}
      </RecordView>
    </div>
  );
}

type ApprovedText = Record<ProductKey, string>;

function parseApproved(text: ApprovedText): Quantities | null {
  const male = parsePieces(text.male);
  const female = parsePieces(text.female);
  return male === null || female === null ? null : { male, female };
}

function approvedErrors(
  order: HotspotOrder,
  text: ApprovedText,
): Partial<Record<ProductKey, string>> {
  const errors: Partial<Record<ProductKey, string>> = {};
  for (const { key } of PRODUCTS) {
    const value = parsePieces(text[key]);
    if (value === null) errors[key] = 'Enter a whole number of pieces.';
    else if (value > order.requested[key])
      errors[key] = `No more than the ${formatNumber(order.requested[key])} requested.`;
  }
  return errors;
}

function OrderReview({ order }: { order: HotspotOrder }) {
  const now = new Date();
  const router = useRouter();
  const store = useDistrictStore();
  const requests = useRequests();
  const confirm = useConfirmOrder(order.id);
  const hold = useHoldOrder(order.id);
  const release = useReleaseOrder();

  const isQueued = order.status === 'queued';
  const [approvedText, setApprovedText] = useState<ApprovedText>({
    male: String(order.approved.male),
    female: String(order.approved.female),
  });
  const [checkedAt, setCheckedAt] = useState<Quantities | null>(null);
  const [entries, setEntries] = useState<PickEntries>({});
  const [failure, setFailure] = useState<string | null>(null);
  // Confirming, holding or releasing replaces the button that did it; the
  // banner then says what is true now, so that is where focus goes.
  const bannerRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(bannerRef, order.status);

  const errors = isQueued ? approvedErrors(order, approvedText) : {};
  const approved = isQueued ? parseApproved(approvedText) : order.approved;
  const hasErrors = Object.keys(errors).length > 0;
  const nothingApproved = approved !== null && approved.male + approved.female === 0;

  const stock = store.data?.stock;
  const checkIsCurrent =
    isQueued &&
    checkedAt !== null &&
    approved !== null &&
    checkedAt.male === approved.male &&
    checkedAt.female === approved.female;
  const check: CheckResult =
    checkIsCurrent && stock ? (covers(stock, approved) ? 'available' : 'short') : null;

  const isHeldAndCovered =
    order.status === 'on_hold' && stock !== undefined && covers(stock, order.approved);
  const showPicker =
    order.allocation.length === 0 &&
    store.data !== undefined &&
    approved !== null &&
    ((isQueued && check === 'available') || isHeldAndCovered);
  const plan = showPicker ? planPicks(store.data.batches, approved, entries, now) : null;
  const picksAreValid = plan !== null && plan.problems.length === 0;

  const linkedRequest = order.warehouse_request_id
    ? requests.data?.find((request) => request.id === order.warehouse_request_id)
    : undefined;
  const isBusy = confirm.isPending || hold.isPending || release.isPending;

  const onError = (error: unknown) => {
    setFailure(getErrorMessage(error));
  };

  function runCheck() {
    setFailure(null);
    if (approved && !hasErrors) setCheckedAt(approved);
  }

  function confirmOrder() {
    if (!approved || !plan) return;
    setFailure(null);
    confirm.mutate({ approved, lines: plan.lines }, { onError });
  }

  function holdOrder(thenRequest: boolean) {
    setFailure(null);
    hold.mutate(
      {
        reason: check === 'short' ? HOLD_SHORT : HOLD_BY_CHOICE,
        ...(approved ? { approved } : {}),
      },
      {
        onError,
        onSuccess: () => {
          if (thenRequest) router.push(DCFP_PATHS.newRequestFor(order.id));
        },
      },
    );
  }

  function releaseOrder() {
    if (!plan) return;
    setFailure(null);
    release.mutate({ id: order.id, lines: plan.lines }, { onError });
  }

  const status = ORDER_STATUS[order.status];

  return (
    <div className="gap-section flex flex-col">
      <DetailHeader
        title={order.id}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`${order.hotspot.name} · ${order.reason} · received ${formatTimestamp(order.created_at, now)}`}
      >
        <StepTracker aria-label="Order progress" steps={orderSteps(order, check, now)} />
      </DetailHeader>

      <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="gap-section flex min-w-0 flex-col">
          <OrderBanner
            ref={bannerRef}
            order={order}
            check={check}
            approved={approved}
            store={store.data}
            linkedRequest={linkedRequest}
            now={now}
          />

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Quantities</CardTitle>
              <CardDescription>
                In pieces.{isQueued ? ' You can approve less than was requested.' : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <ItemsTable<ProductKey>
                label="Quantities"
                rows={PRODUCTS.map((product) => product.key)}
                getRowId={(key) => key}
                columns={[
                  {
                    id: 'product',
                    header: 'Product',
                    cell: (key) => <ProductCell product={key} />,
                  },
                  {
                    id: 'requested',
                    header: 'Requested',
                    numeric: true,
                    cell: (key) => formatNumber(order.requested[key]),
                  },
                  {
                    id: 'approve',
                    header: 'Approve',
                    cell: (key) =>
                      isQueued ? (
                        <div className="flex w-32 flex-col">
                          <Input
                            inputMode="numeric"
                            value={approvedText[key]}
                            onChange={(event) => {
                              setApprovedText((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }));
                            }}
                            aria-label={`Approved quantity, ${productOf(key).name.toLowerCase()}`}
                            aria-invalid={errors[key] ? true : undefined}
                            aria-describedby={errors[key] ? `approve-${key}-error` : undefined}
                            className="h-8 text-right tabular-nums"
                            disabled={isBusy}
                          />
                          <InlineMessage id={`approve-${key}-error`} className="whitespace-normal">
                            {errors[key]}
                          </InlineMessage>
                        </div>
                      ) : (
                        <span className="font-medium tabular-nums">
                          {formatNumber(order.approved[key])}
                        </span>
                      ),
                  },
                  {
                    id: 'in-store',
                    header: 'In store',
                    cell: (key) => (
                      <div className="flex flex-col items-start gap-1">
                        <span className="tabular-nums">
                          {stock ? formatNumber(stock[key]) : '—'}
                        </span>
                        {check !== null && approved ? (
                          <StockCheckBadge check={checkStock(approved[key], stock?.[key] ?? 0)} />
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
              <div className="flex flex-col gap-3 px-(--card-spacing)">
                {nothingApproved && isQueued ? (
                  <p className="text-destructive text-sm" role="status">
                    Approve at least one piece, or put the order on hold.
                  </p>
                ) : null}
                {store.isError ? (
                  <p className="text-destructive text-sm" role="alert">
                    Could not load the district store: {getErrorMessage(store.error)}
                  </p>
                ) : null}
                {failure ? (
                  <Alert variant="destructive">
                    <AlertTitle>That did not go through</AlertTitle>
                    <AlertDescription>{failure}</AlertDescription>
                  </Alert>
                ) : null}
                <OrderActions
                  order={order}
                  check={check}
                  isHeldAndCovered={isHeldAndCovered}
                  canCheck={!hasErrors && !nothingApproved && store.data !== undefined}
                  canCommit={picksAreValid && !nothingApproved}
                  isBusy={isBusy}
                  pending={
                    confirm.isPending
                      ? 'confirm'
                      : hold.isPending
                        ? 'hold'
                        : release.isPending
                          ? 'release'
                          : null
                  }
                  onCheck={runCheck}
                  onConfirm={confirmOrder}
                  onHold={holdOrder}
                  onRelease={releaseOrder}
                />
              </div>
            </CardContent>
          </Card>

          {order.allocation.length > 0 ? <AllocatedBatches order={order} now={now} /> : null}

          {plan ? (
            <BatchPicker
              plan={plan}
              now={now}
              description={
                isQueued
                  ? 'Suggested first-expiry-first-out from the district store. Change the picks if needed: confirming reserves these batches.'
                  : 'Suggested first-expiry-first-out. Releasing the order reserves these batches.'
              }
              onPick={(key, text) => {
                setEntries((current) => ({ ...current, [key]: text }));
              }}
            />
          ) : null}
        </div>

        <div className="gap-section flex min-w-0 flex-col">
          <OrderSummary order={order} />
          <HistoryCard references={[order.id]} now={now} />
        </div>
      </div>
    </div>
  );
}

interface OrderBannerProps {
  ref?: Ref<HTMLDivElement>;
  order: HotspotOrder;
  check: CheckResult;
  approved: Quantities | null;
  store: DistrictStore | undefined;
  linkedRequest: WarehouseRequest | undefined;
  now: Date;
}

/** What is true of the order now, and what to do next. */
function OrderBanner({ ref, order, check, approved, store, linkedRequest, now }: OrderBannerProps) {
  const contact = order.hotspot.contact_name ?? 'The hotspot';
  let variant: 'info' | 'success' | 'warning' | 'default' = 'info';
  let title: string;
  let body: string;

  if (order.status === 'queued' && check === null) {
    title = 'Review the quantities, then check stock';
    body = `You can approve less than ${order.requested_by.name} asked for. Stock is checked against the district store.`;
  } else if (order.status === 'queued' && check === 'available') {
    variant = 'success';
    title = 'All items are available in the district store';
    body = 'Confirming allocates the stock to this order and notifies the hotspot.';
  } else if (order.status === 'queued') {
    variant = 'warning';
    title = 'Not enough stock in the district store';
    const shortfalls = PRODUCTS.filter(
      (product) => approved && store && approved[product.key] > store.stock[product.key],
    ).map(
      (product) =>
        `${product.name}: ${formatNumber(store?.stock[product.key] ?? 0)} in store, ${formatNumber(approved?.[product.key] ?? 0)} needed`,
    );
    body = `${shortfalls.join('. ')}. Put the order on hold and request stock from a warehouse.`;
  } else if (order.status === 'on_hold') {
    variant = 'warning';
    title = `On hold: ${(order.hold_reason ?? 'waiting for stock').toLowerCase()}`;
    body =
      store && covers(store.stock, order.approved)
        ? 'The district store now has enough stock. Release the order to confirm it.'
        : linkedRequest
          ? `Waiting on ${linkedRequest.id} from ${linkedRequest.warehouse} (${REQUEST_STATUS[linkedRequest.status].label.toLowerCase()}).`
          : order.warehouse_request_id
            ? `Waiting on ${order.warehouse_request_id}.`
            : 'No warehouse request has been raised for this order yet.';
  } else if (order.status === 'confirmed') {
    variant = 'success';
    title = `Confirmed ${formatTimestamp(order.confirmed_at, now)}`;
    body = `${contact} was notified. Assign a rider and print the delivery note.`;
  } else if (order.status === 'dispatched' || order.status === 'in_transit') {
    const rider = order.delivery?.rider.name ?? 'the rider';
    title =
      order.status === 'dispatched'
        ? `Waiting for ${rider} to collect`
        : `Out for delivery with ${rider}`;
    body = order.delivery
      ? `Delivery note ${order.delivery.note_number} · ${order.delivery.rider.plate}.`
      : '';
  } else if (order.status === 'delivered') {
    variant = 'success';
    title = `Delivered ${formatTimestamp(order.delivery?.delivered_at ?? null, now)}`;
    body = `Signed delivery note photographed. Waiting for ${contact} to confirm receipt.`;
  } else {
    variant = 'default';
    title = 'Closed';
    body = `${contact} confirmed receipt ${formatTimestamp(order.received_at, now)}.`;
  }

  return (
    <Alert ref={ref} tabIndex={-1} variant={variant} role="status">
      <AlertTitle>{title}</AlertTitle>
      {body ? <AlertDescription>{body}</AlertDescription> : null}
    </Alert>
  );
}

interface OrderActionsProps {
  order: HotspotOrder;
  check: CheckResult;
  isHeldAndCovered: boolean;
  canCheck: boolean;
  canCommit: boolean;
  isBusy: boolean;
  pending: 'confirm' | 'hold' | 'release' | null;
  onCheck: () => void;
  onConfirm: () => void;
  onHold: (thenRequest: boolean) => void;
  onRelease: () => void;
}

function OrderActions({
  order,
  check,
  isHeldAndCovered,
  canCheck,
  canCommit,
  isBusy,
  pending,
  onCheck,
  onConfirm,
  onHold,
  onRelease,
}: OrderActionsProps) {
  // Every next step changes the order; someone viewing read-only takes none.
  const readOnly = useReadOnly();
  const buttons = [];

  if (order.status === 'queued') {
    buttons.push(
      <Button
        key="check"
        variant={check === null ? 'default' : 'outline'}
        onClick={onCheck}
        disabled={!canCheck || isBusy}
      >
        {check === null ? 'Check stock availability' : 'Check again'}
      </Button>,
    );
    if (check === 'available') {
      buttons.push(
        <Button
          key="hold"
          variant="outline"
          onClick={() => {
            onHold(false);
          }}
          disabled={isBusy}
        >
          {pending === 'hold' ? 'Putting on hold…' : 'Put on hold'}
        </Button>,
        <Button key="confirm" onClick={onConfirm} disabled={!canCommit || isBusy}>
          {pending === 'confirm' ? 'Confirming…' : 'Confirm order and notify hotspot'}
        </Button>,
      );
    } else if (check === 'short') {
      buttons.push(
        <Button
          key="hold"
          variant="outline"
          onClick={() => {
            onHold(false);
          }}
          disabled={isBusy}
        >
          Put on hold only
        </Button>,
        <Button
          key="hold-request"
          onClick={() => {
            onHold(true);
          }}
          disabled={isBusy}
        >
          {pending === 'hold' ? 'Putting on hold…' : 'Put on hold and request from warehouse'}
        </Button>,
      );
    }
  } else if (order.status === 'on_hold') {
    if (isHeldAndCovered) {
      buttons.push(
        <Button key="release" onClick={onRelease} disabled={!canCommit || isBusy}>
          {pending === 'release' ? 'Releasing…' : 'Release from hold and confirm'}
        </Button>,
      );
    } else if (order.warehouse_request_id) {
      buttons.push(
        <Button key="view" asChild variant="outline">
          <Link href={DCFP_PATHS.request(order.warehouse_request_id)}>
            View {order.warehouse_request_id}
          </Link>
        </Button>,
      );
    } else {
      buttons.push(
        <Button key="request" asChild>
          <Link href={DCFP_PATHS.newRequestFor(order.id)}>Request stock from warehouse</Link>
        </Button>,
      );
    }
  } else if (order.status === 'confirmed') {
    buttons.push(
      <Button key="dispatch" asChild>
        <Link href={DCFP_PATHS.dispatchOrder(order.id)}>Prepare dispatch</Link>
      </Button>,
    );
  }

  if (readOnly || buttons.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{buttons}</div>
  );
}

function AllocatedBatches({ order, now }: { order: HotspotOrder; now: Date }) {
  const near = order.allocation.filter((line) => expiryOf(line.expires_on, now).state === 'near');
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Allocated batches</CardTitle>
        <CardDescription>
          Reserved for this order. These batch lines print on the delivery note.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0">
        <ItemsTable
          label="Allocated batches"
          rows={order.allocation}
          getRowId={(line) => `${line.product}:${line.batch}`}
          columns={[
            {
              id: 'product',
              header: 'Product',
              cell: (line) => <ProductCell product={line.product} />,
            },
            { id: 'batch', header: 'Batch', cell: (line) => line.batch },
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
              id: 'status',
              header: 'Status',
              cell: (line) => <BatchStatusBadge expiresOn={line.expires_on} now={now} />,
            },
          ]}
        />
        {near.length > 0 ? (
          <p className="text-warning px-(--card-spacing) text-sm">
            {near.length} batch{near.length > 1 ? 'es expire' : ' expires'} within{' '}
            {NEAR_EXPIRY_MONTHS} months: tell the hotspot to use {near.length > 1 ? 'them' : 'it'}{' '}
            first.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OrderSummary({ order }: { order: HotspotOrder }) {
  const { hotspot } = order;
  const place = [hotspot.village, hotspot.subcounty].filter(Boolean).join(', ');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Request</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailList
          items={[
            {
              label: 'Requested by',
              value: (
                <>
                  {order.requested_by.name}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {order.requested_by.role}
                  </span>
                </>
              ),
            },
            { label: 'Reason', value: order.reason },
            { label: 'Stock left when reported', value: formatQuantities(order.stock_at_hotspot) },
            { label: 'Note', value: order.note ?? '—' },
          ]}
        />
        <div className="flex flex-col gap-3 border-t pt-4">
          <h3 className="text-base font-medium">Hotspot</h3>
          <div>
            <p className="font-medium break-words">{hotspot.name}</p>
            <p className="text-muted-foreground text-xs">
              {[hotspot.kind, place].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <DetailList
            items={[
              { label: 'Contact person', value: hotspot.contact_name ?? '—' },
              {
                label: 'Phone',
                value: hotspot.contact_phone ? (
                  <a
                    href={`tel:${hotspot.contact_phone.replace(/\s/g, '')}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {hotspot.contact_phone}
                  </a>
                ) : (
                  '—'
                ),
              },
              { label: 'Dispenser', value: hotspot.dispenser ?? 'None' },
              { label: 'Covering VHT', value: hotspot.vhts.join(', ') || '—' },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
