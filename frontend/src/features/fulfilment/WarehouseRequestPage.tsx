'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useId, useRef, useState, type Ref, type SyntheticEvent } from 'react';

import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { InlineMessage } from '@/components/InlineMessage';
import { ItemsTable } from '@/components/ItemsTable';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { StepTracker } from '@/components/StepTracker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFocusWhenLost } from '@/hooks/useFocusWhenLost';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  RECEIPT_CONDITIONS,
  type BatchLine,
  type ReceiptCondition,
  type WarehouseRequest,
} from './api';
import { expiryOf, MIN_SHELF_MONTHS } from './batches';
import { ExpiryCell } from './BatchCells';
import { HistoryCard } from './HistoryCard';
import { requestSteps } from './progress';
import { PRODUCTS, productOf } from './products';
import { useDistrictStore, useOrders, useReceiveRequest, useRequest } from './queries';
import { RecordView } from '@/components/RecordView';
import { WriteAction } from '@/components/WriteAction';
import {
  defaultDiscrepancyType,
  discrepancySummary,
  DISCREPANCY_TYPES,
  formatDifference,
  receiptInput,
  receiptRows,
  rowDiffers,
  type DiscrepancyType,
  type ReceiptEntry,
  type ReceiptRow,
} from './restock';
import { ORDER_STATUS, REQUEST_STATUS, WAREHOUSE_NAMES } from './status';
import { DCFP_PATHS, releasable } from './tasks';

export default function WarehouseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const request = useRequest(id);
  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The request and stock figures" />
      <RecordView
        query={request}
        layout="detail"
        noun="warehouse request"
        back={{ href: DCFP_PATHS.requests, label: 'Back to warehouse requests' }}
      >
        {(data) => <RequestView request={data} />}
      </RecordView>
    </div>
  );
}

function RequestView({ request }: { request: WarehouseRequest }) {
  const now = new Date();
  const status = REQUEST_STATUS[request.status];
  // Confirming receipt replaces the form with what was received; focus goes
  // to the banner that says so.
  const receivedRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(receivedRef, request.status);
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={request.id}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`To ${WAREHOUSE_NAMES[request.warehouse]} (${request.warehouse}) · sent ${formatTimestamp(request.created_at, now)}`}
      >
        <StepTracker aria-label="Request progress" steps={requestSteps(request, now)} />
      </DetailHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <WaitingBanner request={request} />
          {request.status === 'dispatched' && request.dispatch ? (
            <ReceiveForm request={request} dispatch={request.dispatch} now={now} />
          ) : null}
          {request.receipt ? (
            <ReceivedSummary
              bannerRef={receivedRef}
              request={request}
              receipt={request.receipt}
              now={now}
            />
          ) : null}
          <QuantitiesCard request={request} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LinkedOrdersCard request={request} />
          <HistoryCard references={[request.id]} now={now} />
        </div>
      </div>
    </div>
  );
}

/** What the district is waiting for while the warehouse has the request. */
function WaitingBanner({ request }: { request: WarehouseRequest }) {
  const { warehouse } = request;
  let variant: 'info' | 'warning' = 'info';
  let title: string;
  let body: string;
  switch (request.status) {
    case 'sent':
      title = `Sent to ${warehouse}`;
      body = `${warehouse} has not opened this request yet. You'll be notified when it is reviewed.`;
      break;
    case 'under_review':
      title = `${warehouse} is reviewing this request`;
      body = 'They will check their stock next.';
      break;
    case 'queued':
      title = `Accepted and queued at ${warehouse}`;
      body = 'The request is waiting to be picked and dispatched.';
      break;
    case 'on_hold':
      variant = 'warning';
      title = `On hold at ${warehouse}`;
      body = `${request.hold_reason ? `${request.hold_reason.replace(/\.$/, '')}. ` : ''}Linked orders stay on hold until this stock arrives.`;
      break;
    default:
      return null;
  }
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}

type Dispatch = NonNullable<WarehouseRequest['dispatch']>;
type Receipt = NonNullable<WarehouseRequest['receipt']>;

/** A batch line's product over its batch number and manufacture date. */
function BatchLineCell({ line }: { line: BatchLine }) {
  return (
    <div className="min-w-0">
      <div className="font-medium">{productOf(line.product).name}</div>
      <div className="text-muted-foreground text-xs">
        Batch {line.batch} · made {formatDate(line.manufactured_on)}
      </div>
    </div>
  );
}

interface ReceiveFormProps {
  request: WarehouseRequest;
  dispatch: Dispatch;
  now: Date;
}

/** Counting a consignment against its waybill, then confirming receipt. */
function ReceiveForm({ request, dispatch, now }: ReceiveFormProps) {
  const receive = useReceiveRequest(request.id);
  const formId = useId();
  const [entries, setEntries] = useState<readonly ReceiptEntry[]>([]);
  const [typeChoice, setTypeChoice] = useState<DiscrepancyType | null>(null);
  const [note, setNote] = useState('');
  const [checkedCartons, setCheckedCartons] = useState(false);
  const [signedWaybill, setSignedWaybill] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const rows = receiptRows(dispatch.lines, entries);
  const hasDiscrepancy = rows.some(rowDiffers);
  const discrepancyType = typeChoice ?? defaultDiscrepancyType(rows);
  const shortShelf = rows.filter((row) => expiryOf(row.line.expires_on, now).state !== 'ok');
  const lines = receiptInput(rows);

  const noteError =
    hasDiscrepancy && note.trim().length < 3 ? 'Say what happened before confirming.' : null;
  const checksError =
    !checkedCartons || !signedWaybill
      ? 'Confirm both checks before issuing the goods received note.'
      : null;
  const isBusy = receive.isPending;

  function update(index: number, change: ReceiptEntry) {
    setEntries((current) => {
      const next = [...current];
      next[index] = { ...current[index], ...change };
      return next;
    });
  }

  const noteId = `${formId}-note`;
  const cartonsId = `${formId}-cartons`;
  const signedId = `${formId}-signed`;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (isBusy) return;
    if (!lines || noteError || checksError) {
      // Take the user to the first thing to fix once the attempt has rendered
      // its message, so the field is invalid and described when focus lands.
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        const first = !lines
          ? form.querySelector<HTMLElement>('[aria-invalid="true"]')
          : document.getElementById(noteError ? noteId : !checkedCartons ? cartonsId : signedId);
        first?.focus();
      });
      return;
    }
    setFailure(null);
    receive.mutate(
      {
        lines,
        discrepancy: hasDiscrepancy ? { type: discrepancyType, note: note.trim() } : null,
      },
      {
        onError: (error) => {
          setFailure(getErrorMessage(error));
        },
      },
    );
  }

  const noteErrorId = `${formId}-note-error`;
  const checksErrorId = `${formId}-checks-error`;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Receive and verify stock</CardTitle>
        <CardDescription>
          Count each batch against the waybill, check batch numbers and expiry dates, and note its
          condition.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DetailList
            variant="grid"
            className="px-(--card-spacing)"
            items={[
              { label: 'Waybill', value: dispatch.waybill },
              { label: 'Vehicle', value: dispatch.vehicle },
              { label: 'Driver', value: dispatch.driver },
              { label: 'Dispatched', value: formatTimestamp(dispatch.dispatched_at, now) },
            ]}
          />
          <ItemsTable<ReceiptRow>
            label="Waybill lines"
            rows={rows}
            getRowId={(row) => `${row.line.product}:${row.line.batch}`}
            rowTone={(row) => (rowDiffers(row) ? 'caution' : 'default')}
            columns={[
              { id: 'batch', header: 'Batch', cell: (row) => <BatchLineCell line={row.line} /> },
              {
                id: 'expires',
                header: 'Expires',
                cell: (row) => <ExpiryCell expiresOn={row.line.expires_on} now={now} />,
              },
              {
                id: 'waybill',
                header: 'On waybill',
                numeric: true,
                cell: (row) => formatNumber(row.line.quantity),
              },
              {
                id: 'counted',
                header: 'Counted',
                cell: (row) => {
                  const index = rows.indexOf(row);
                  const errorId = `${formId}-${String(index)}-counted`;
                  return (
                    <div className="flex w-28 flex-col">
                      <Input
                        inputMode="numeric"
                        value={row.countedText}
                        onChange={(event) => {
                          update(index, { counted: event.target.value });
                        }}
                        aria-label={`Counted, batch ${row.line.batch}`}
                        aria-invalid={row.countedError ? true : undefined}
                        aria-describedby={row.countedError ? errorId : undefined}
                        className="h-8 text-right tabular-nums"
                        disabled={isBusy}
                      />
                      <InlineMessage id={errorId}>{row.countedError}</InlineMessage>
                    </div>
                  );
                },
              },
              {
                id: 'condition',
                header: 'Condition',
                cell: (row) => {
                  const index = rows.indexOf(row);
                  return (
                    <Select
                      value={row.condition}
                      onValueChange={(value) => {
                        const condition = RECEIPT_CONDITIONS.find((known) => known === value);
                        if (condition) update(index, { condition });
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-48"
                        aria-label={`Condition of batch ${row.line.batch}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECEIPT_CONDITIONS.map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                },
              },
              {
                id: 'damaged',
                header: 'Damaged',
                cell: (row) => {
                  if (row.condition !== 'Damaged') {
                    return <span className="text-muted-foreground">—</span>;
                  }
                  const index = rows.indexOf(row);
                  const errorId = `${formId}-${String(index)}-damaged`;
                  return (
                    <div className="flex w-24 flex-col">
                      <Input
                        inputMode="numeric"
                        value={row.damagedText}
                        onChange={(event) => {
                          update(index, { damaged: event.target.value });
                        }}
                        aria-label={`Damaged pieces, batch ${row.line.batch}`}
                        aria-invalid={row.damagedError ? true : undefined}
                        aria-describedby={row.damagedError ? errorId : undefined}
                        className="h-8 text-right tabular-nums"
                        disabled={isBusy}
                      />
                      <InlineMessage id={errorId}>{row.damagedError}</InlineMessage>
                    </div>
                  );
                },
              },
              {
                id: 'accepted',
                header: 'Accepted',
                numeric: true,
                cell: (row) => <span className="font-medium">{formatNumber(row.accepted)}</span>,
              },
              {
                id: 'difference',
                header: 'Difference',
                numeric: true,
                cell: (row) => (
                  <span className={cn(row.difference !== 0 && 'text-destructive font-medium')}>
                    {formatDifference(row.difference)}
                  </span>
                ),
              },
            ]}
          />

          <div className="flex flex-col gap-4 px-(--card-spacing)">
            {shortShelf.length > 0 ? (
              <Alert variant="warning">
                <AlertTitle>Short shelf life</AlertTitle>
                <AlertDescription>
                  {shortShelf.map((row) => row.line.batch).join(', ')}{' '}
                  {shortShelf.length > 1 ? 'have' : 'has'} less than {MIN_SHELF_MONTHS} months shelf
                  life. Accept only if it can be used before it expires.
                </AlertDescription>
              </Alert>
            ) : null}

            {hasDiscrepancy ? (
              <section
                aria-labelledby={`${formId}-discrepancy`}
                className="border-warning/40 flex flex-col gap-3 rounded-lg border p-3"
              >
                <div>
                  <h3 id={`${formId}-discrepancy`} className="text-sm font-semibold">
                    Document discrepancy
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {discrepancySummary(rows)}. This is shared with {request.warehouse} and kept on
                    the audit trail.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${formId}-type`}>Type</Label>
                    <Select
                      value={discrepancyType}
                      onValueChange={(value) => {
                        const type = DISCREPANCY_TYPES.find((known) => known === value);
                        if (type) setTypeChoice(type);
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger id={`${formId}-type`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISCREPANCY_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={noteId}>What happened</Label>
                    <Input
                      id={noteId}
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                      }}
                      placeholder="e.g. One carton torn, 200 pieces wet"
                      aria-invalid={attempted && noteError ? true : undefined}
                      aria-describedby={attempted && noteError ? noteErrorId : undefined}
                      disabled={isBusy}
                    />
                    {attempted && noteError ? (
                      <FieldError id={noteErrorId} className="text-xs">
                        {noteError}
                      </FieldError>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : (
              <p className="text-sm">
                <span className="font-medium">No discrepancy.</span> Counted quantities, batches and
                expiry dates match the waybill.
              </p>
            )}

            <fieldset className="flex flex-col gap-2" disabled={isBusy}>
              <legend className="sr-only">Checks</legend>
              <label htmlFor={cartonsId} className="flex items-start gap-2 text-sm">
                <Checkbox
                  id={cartonsId}
                  aria-invalid={attempted && !checkedCartons ? true : undefined}
                  aria-describedby={attempted && checksError ? checksErrorId : undefined}
                  checked={checkedCartons}
                  onChange={(event) => {
                    setCheckedCartons(event.target.checked);
                  }}
                  className="mt-0.5"
                />
                I checked batch numbers and expiry dates on the cartons
              </label>
              <label htmlFor={signedId} className="flex items-start gap-2 text-sm">
                <Checkbox
                  id={signedId}
                  aria-invalid={attempted && !signedWaybill ? true : undefined}
                  aria-describedby={attempted && checksError ? checksErrorId : undefined}
                  checked={signedWaybill}
                  onChange={(event) => {
                    setSignedWaybill(event.target.checked);
                  }}
                  className="mt-0.5"
                />
                I signed waybill {dispatch.waybill} and kept a copy
              </label>
              {attempted && checksError ? (
                <FieldError id={checksErrorId} className="text-xs">
                  {checksError}
                </FieldError>
              ) : null}
            </fieldset>

            {failure ? (
              <Alert variant="destructive">
                <AlertTitle>Receipt was not recorded</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <WriteAction>
                <Button type="submit" disabled={isBusy} className="w-full sm:w-auto">
                  {isBusy ? 'Confirming…' : 'Confirm receipt and issue GRN'}
                </Button>
              </WriteAction>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const CONDITION_TONES: Record<
  ReceiptCondition,
  { label: string; tone: 'positive' | 'negative' | 'caution' }
> = {
  Intact: { label: 'Intact', tone: 'positive' },
  Damaged: { label: 'Damaged', tone: 'negative' },
  'Batch or expiry differs': { label: 'Label differs', tone: 'caution' },
};

function conditionBadge(condition: string) {
  const known = RECEIPT_CONDITIONS.find((candidate) => candidate === condition);
  const { label, tone } = known
    ? CONDITION_TONES[known]
    : { label: condition, tone: 'caution' as const };
  return <StatusBadge status={label} tone={tone} />;
}

interface ReceivedSummaryProps {
  /** The success banner, focused after the receipt is confirmed. */
  bannerRef?: Ref<HTMLDivElement>;
  request: WarehouseRequest;
  receipt: Receipt;
  now: Date;
}

/** What was received: the held orders it can free, the GRN and any discrepancy. */
function ReceivedSummary({ bannerRef, request, receipt, now }: ReceivedSummaryProps) {
  const orders = useOrders();
  const store = useDistrictStore();
  const held = orders.data?.filter((order) => order.status === 'on_hold') ?? [];
  const canRelease = orders.data && store.data ? releasable(orders.data, store.data.stock) : [];
  const plural = held.length > 1;

  return (
    <>
      <Alert ref={bannerRef} tabIndex={-1} variant="success">
        <AlertTitle>
          Received {formatTimestamp(receipt.received_at, now)}: district stock updated
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {!orders.data
              ? 'Checking held orders…'
              : held.length > 0
                ? `${String(held.length)} order${plural ? 's are' : ' is'} on hold: ${String(canRelease.length)} can now be fulfilled.`
                : 'No orders are waiting on stock.'}
          </span>
          {held.length > 0 ? (
            <Button asChild size="sm" variant="outline" className="self-start sm:self-auto">
              <Link href={DCFP_PATHS.held}>Review held orders</Link>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>

      <Card className="min-w-0" data-print-region>
        <CardHeader>
          <CardTitle>Goods received note {receipt.grn}</CardTitle>
          <CardDescription>
            Received {formatTimestamp(receipt.received_at, now)} from {request.warehouse}
            {request.dispatch ? ` on waybill ${request.dispatch.waybill}` : ''} · checked by{' '}
            {receipt.received_by}
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.print();
              }}
            >
              <Printer data-icon="inline-start" />
              Print GRN
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-0">
          <ItemsTable
            label={`Goods received note ${receipt.grn}`}
            rows={receipt.lines}
            getRowId={(line) => `${line.product}:${line.batch}`}
            emptyText="No batch lines were recorded."
            columns={[
              { id: 'batch', header: 'Batch', cell: (line) => <BatchLineCell line={line} /> },
              {
                id: 'expires',
                header: 'Expires',
                cell: (line) => <ExpiryCell expiresOn={line.expires_on} now={now} />,
              },
              {
                id: 'waybill',
                header: 'On waybill',
                numeric: true,
                cell: (line) => formatNumber(line.on_waybill),
              },
              {
                id: 'accepted',
                header: 'Accepted',
                numeric: true,
                cell: (line) => formatNumber(line.accepted),
              },
              {
                id: 'condition',
                header: 'Condition',
                cell: (line) => conditionBadge(line.condition),
              },
            ]}
          />
          {receipt.discrepancy ? (
            <div className="px-(--card-spacing)">
              <Alert variant="warning">
                <AlertTitle>Discrepancy · {receipt.discrepancy.type}</AlertTitle>
                <AlertDescription>{receipt.discrepancy.note}</AlertDescription>
              </Alert>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function QuantitiesCard({ request }: { request: WarehouseRequest }) {
  const { dispatch, receipt } = request;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Quantities</CardTitle>
        <CardDescription>In pieces.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ItemsTable
          label="Quantities"
          rows={PRODUCTS}
          getRowId={(product) => product.key}
          columns={[
            { id: 'product', header: 'Product', cell: (product) => product.name },
            {
              id: 'needed',
              header: 'Needed',
              numeric: true,
              cell: (product) => formatNumber(request.items[product.key]),
            },
            {
              id: 'issued',
              header: 'Issued',
              numeric: true,
              cell: (product) => (dispatch ? formatNumber(dispatch.items[product.key]) : '—'),
            },
            {
              id: 'accepted',
              header: 'Accepted',
              numeric: true,
              cell: (product) => (receipt ? formatNumber(receipt.accepted[product.key]) : '—'),
            },
            {
              id: 'after',
              header: 'Store after',
              numeric: true,
              cell: (product) => (receipt ? formatNumber(receipt.store_after[product.key]) : '—'),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function LinkedOrdersCard({ request }: { request: WarehouseRequest }) {
  const orders = useOrders();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Held orders linked</CardTitle>
        <CardDescription>Hotspot orders waiting on this stock</CardDescription>
      </CardHeader>
      <CardContent>
        {request.linked_orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">None: a top-up request.</p>
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Held orders linked">
            {request.linked_orders.map((orderId) => {
              const order = orders.data?.find((candidate) => candidate.id === orderId);
              const status = order ? ORDER_STATUS[order.status] : null;
              return (
                <li
                  key={orderId}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={DCFP_PATHS.order(orderId)}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {orderId}
                    </Link>
                    {order ? (
                      <p className="text-muted-foreground truncate text-xs">{order.hotspot.name}</p>
                    ) : null}
                  </div>
                  {status ? <StatusBadge status={status.label} tone={status.tone} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
