'use client';

import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useId, useState, type SyntheticEvent } from 'react';

import { ActivityTimeline, type ActivityEntry } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { SelectField } from '@/components/form/SelectField';
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
import { useCurrentUser } from '@/features/auth/hooks';
import { hasPermissions } from '@/features/auth/session';
import { useProducts } from '@/features/catalogue/queries';
import { getErrorMessage, toApiError } from '@/lib/api';
import { formatNumber, formatTimestamp } from '@/lib/format';

import type { HotspotDelivery, StockoutDetail } from './api';
import { contactOf, DCFP_PATHS, parseCount, placeOf } from './orders';
import { useRecordDelivery, useStockout, useStoreStock } from './queries';
import {
  deliverableProducts,
  deliveryLineErrors,
  missingCategories,
  STOCKOUT_STATUS,
  stockoutEventLabel,
  stockoutEventRole,
  stockoutSteps,
  type DeliverableProduct,
  type DraftLine,
} from './stockouts';

/** Recording a delivery to a hotspot (`POST /orders/stockouts/{id}/deliveries`). */
export const SUPPLY_PERMISSION = 'orders:supply_hotspots';

/** Why a DCFP cannot send stock, and who can change that. */
const NOT_ALLOWED =
  'Your account is not allowed to record deliveries to hotspots yet. Ask an administrator to give your role the “Deliver stock to hotspots in their district” permission on the Roles page.';

/** A stockout report: what the hotspot asked for, what has been sent, and sending more. */
export default function StockoutPage() {
  const { id } = useParams<{ id: string }>();
  const report = useStockout(id);

  if (report.error) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load this stockout"
          error={report.error}
          onRetry={() => void report.refetch()}
          isRetrying={report.isRefetching}
        />
      </div>
    );
  }
  if (!report.data) return <PageSkeleton layout="detail" />;
  return <StockoutDetailView report={report.data} />;
}

function StockoutDetailView({ report }: { report: StockoutDetail }) {
  const canSend = hasPermissions(useCurrentUser(), [SUPPLY_PERMISSION]);
  const status = STOCKOUT_STATUS[report.status];
  const history: ActivityEntry[] = [...report.events]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((event) => ({
      id: event.id,
      text: stockoutEventLabel(event),
      meta: formatTimestamp(event.created_at),
      role: stockoutEventRole(event.action),
    }));
  const deliveries = [...report.deliveries].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={report.hot_spot.name}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`Out of ${report.product} · reported ${formatTimestamp(report.created_at)}`}
      >
        <StepTracker aria-label="Stockout progress" steps={stockoutSteps(report)} />
      </DetailHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {report.status === 'fulfilled' ? (
            <Alert>
              <AlertTitle>Fulfilled</AlertTitle>
              <AlertDescription>
                The hotspot confirmed receipt of everything it asked for. If it runs out again, its
                next report opens a new stockout.
              </AlertDescription>
            </Alert>
          ) : canSend ? (
            <WriteAction>
              <SendStockCard report={report} />
            </WriteAction>
          ) : (
            <WriteAction>
              <Alert>
                <AlertTitle>You cannot send stock from here yet</AlertTitle>
                <AlertDescription>{NOT_ALLOWED}</AlertDescription>
              </Alert>
            </WriteAction>
          )}

          {deliveries.map((delivery, index) => (
            <DeliveryCard
              key={delivery.id}
              delivery={delivery}
              heading={deliveries.length > 1 ? `Delivery ${index + 1}` : 'Delivery'}
            />
          ))}

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
              <h3>Stockout</h3>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: 'Out of', value: report.product },
                { label: 'Where', value: placeOf(report) || '—' },
                { label: 'Contact', value: contactOf(report) || '—' },
                { label: 'Reported by', value: report.reported_by },
                {
                  label: 'Reported again',
                  value:
                    report.repeat_count > 0
                      ? `${formatNumber(report.repeat_count)} ${report.repeat_count === 1 ? 'time' : 'times'}, last ${formatTimestamp(report.last_reported_at)}`
                      : 'No',
                },
                { label: 'Message', value: report.comment ?? 'No message' },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeliveryCard({ delivery, heading }: { delivery: HotspotDelivery; heading: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h3>{heading}</h3>
        </CardTitle>
        <CardDescription>
          Sent {formatTimestamp(delivery.created_at)}
          {delivery.note ? ` · ${delivery.note}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList
          items={delivery.lines.map((line) => ({
            label: line.product,
            value:
              line.acknowledged_pieces === null
                ? `${formatNumber(line.pieces)} pieces sent · not confirmed yet`
                : `${formatNumber(line.pieces)} sent · ${formatNumber(line.acknowledged_pieces)} received`,
          }))}
        />
      </CardContent>
    </Card>
  );
}

const newLine = (): DraftLine => ({ key: crypto.randomUUID(), productId: '', quantity: '' });

/** The form that sends stock from the district store to the hotspot. */
function SendStockCard({ report }: { report: StockoutDetail }) {
  const products = useProducts();
  const stock = useStoreStock(report.district_store_id);

  if (products.error) {
    return (
      <Card>
        <ErrorState
          title="Could not load the products"
          error={products.error}
          onRetry={() => void products.refetch()}
          isRetrying={products.isRefetching}
        />
      </Card>
    );
  }
  // The store's stock is a guide: without `inventory:read` the form still works and the API
  // refuses a delivery the store cannot cover.
  if (!products.data || stock.isPending) return <PageSkeleton layout="form" />;
  return (
    <SendStockForm
      report={report}
      products={deliverableProducts(products.data, report.selection, stock.data ?? null)}
      stockUnknown={!stock.data}
    />
  );
}

function SendStockForm({
  report,
  products,
  stockUnknown,
}: {
  report: StockoutDetail;
  products: readonly DeliverableProduct[];
  stockUnknown: boolean;
}) {
  const record = useRecordDelivery(report.id);
  const noteId = useId();
  const reasonId = useId();

  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  // One reference per delivery: a retried send of the same delivery is recorded once.
  const [reference, setReference] = useState(() => crypto.randomUUID());

  const lineErrors = deliveryLineErrors(lines, products);
  const hasLineErrors = lineErrors.some((errors) => Object.keys(errors).length > 0);
  const missing = missingCategories(report.selection, lines, products);

  const apiError = record.error ? toApiError(record.error) : null;
  // Stock expiring within a month only leaves the store with a reason (first expiry first out).
  const needsReason = Boolean(apiError?.fieldErrors.expiry_exception_reason);
  const reasonMissing = needsReason && !reason.trim();
  const failure =
    apiError && !needsReason
      ? apiError.status === 403
        ? NOT_ALLOWED
        : getErrorMessage(record.error)
      : null;

  function update(key: string, change: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (record.isPending || hasLineErrors || reasonMissing) return;
    record.mutate(
      {
        lines: lines.map((line) => ({
          condom_id: line.productId,
          quantity: parseCount(line.quantity) ?? 0,
        })),
        note: note.trim() || null,
        client_reference: reference,
        ...(needsReason ? { expiry_exception_reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          setLines([newLine()]);
          setNote('');
          setReason('');
          setAttempted(false);
          setReference(crypto.randomUUID());
        },
      },
    );
  }

  const busy = record.isPending;
  const options = products.map((product) => ({
    value: product.id,
    label:
      product.available === null
        ? product.name
        : `${product.name} · ${formatNumber(product.available)} ${product.unit} available`,
  }));

  if (products.length === 0) {
    return (
      <Alert>
        <AlertTitle>No product to send</AlertTitle>
        <AlertDescription>
          The catalogue has no active {report.product} that can be counted out. Ask an administrator
          to add one, or order stock from a warehouse.
        </AlertDescription>
      </Alert>
    );
  }

  const nothingInStock = !stockUnknown && products.every((product) => product.available === 0);

  return (
    <Card>
      <form onSubmit={submit} noValidate aria-labelledby="send-stock-heading">
        <CardHeader>
          <CardTitle asChild>
            <h3 id="send-stock-heading">Send stock to the hotspot</h3>
          </CardTitle>
          <CardDescription>
            Record what leaves the district store for {report.hot_spot.name}. Quantities are in each
            product&apos;s unit. The hotspot&apos;s manager then confirms what arrived in the field
            app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {nothingInStock ? (
            <Alert>
              <AlertTitle>The district store has none of this</AlertTitle>
              <AlertDescription>
                Order stock from a warehouse first, then send it here once it is received.{' '}
                <Link
                  className="font-medium underline"
                  href={DCFP_PATHS.newOrderFor(report.selection)}
                >
                  Order from a warehouse
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}
          {stockUnknown ? (
            <p className="text-muted-foreground text-sm">
              The district store&apos;s stock could not be shown. CLIMS still checks it when you
              send.
            </p>
          ) : null}

          {lines.map((line, index) => {
            const product = products.find((candidate) => candidate.id === line.productId);
            const errors = lineErrors[index] ?? {};
            const count = parseCount(line.quantity);
            return (
              <fieldset
                key={line.key}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-start"
              >
                <legend className="sr-only">Line {index + 1}</legend>
                <SelectField
                  label={lines.length > 1 ? `Product ${index + 1}` : 'Product'}
                  required
                  value={line.productId}
                  onValueChange={(value) => {
                    update(line.key, { productId: value });
                  }}
                  options={options}
                  placeholder="Choose a product"
                  error={attempted ? errors.productId : undefined}
                  disabled={busy}
                />
                <TextField
                  label="Quantity"
                  required
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) => {
                    update(line.key, { quantity: event.target.value });
                  }}
                  description={
                    product
                      ? count && count > 0
                        ? `${product.unit} · ${formatNumber(count * product.piecesPerUnit)} pieces`
                        : `In ${product.unit}`
                      : undefined
                  }
                  error={attempted ? errors.quantity : undefined}
                  disabled={busy}
                  className="tabular-nums"
                />
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:mt-6"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => {
                      setLines((current) => current.filter((other) => other.key !== line.key));
                    }}
                    disabled={busy}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </fieldset>
            );
          })}

          {lines.length < Math.min(20, products.length) ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLines((current) => [...current, newLine()]);
                }}
                disabled={busy}
              >
                <Plus aria-hidden />
                Add another product
              </Button>
            </div>
          ) : null}

          {report.selection === 'both' && missing.length === 1 && lines.some((l) => l.productId) ? (
            <p className="text-muted-foreground text-sm">
              The hotspot asked for male and female condoms. This delivery has no {missing[0]}{' '}
              condoms; the stockout stays open until both have arrived.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={noteId}>
              Note for the hotspot{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id={noteId}
              rows={2}
              maxLength={4000}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              placeholder="e.g. Sent with the Katabi outreach team"
              disabled={busy}
            />
          </div>

          {needsReason ? (
            <div className="flex flex-col gap-2">
              <Alert>
                <AlertTitle>Some of this stock expires within a month</AlertTitle>
                <AlertDescription>
                  {apiError?.fieldErrors.expiry_exception_reason?.[0] ??
                    'Say why it should leave the store.'}{' '}
                  Your reason is recorded with your name.
                </AlertDescription>
              </Alert>
              <Label htmlFor={reasonId}>Why send stock that expires soon?</Label>
              <Textarea
                id={reasonId}
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                aria-invalid={attempted && reasonMissing}
                placeholder="e.g. The hotspot will use it within two weeks"
                disabled={busy}
              />
              {attempted && reasonMissing ? (
                <p className="text-destructive text-sm" role="alert">
                  Give a reason to send it.
                </p>
              ) : null}
            </div>
          ) : null}

          {failure ? (
            <Alert variant="destructive">
              <AlertTitle>The delivery was not recorded</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}
          {attempted && hasLineErrors ? (
            <p className="text-destructive text-sm" role="alert">
              Check the highlighted fields.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              <PackagePlus aria-hidden />
              {busy ? 'Recording…' : 'Record delivery'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
