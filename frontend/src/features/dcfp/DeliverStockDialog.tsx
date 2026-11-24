import { CircleAlert, Package } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useProducts } from '@/features/catalogue/queries';
import { productName } from '@/features/catalogue/api';
import type { ProductSummary } from '@/features/inventory/api';
import { getErrorMessage, toApiError } from '@/lib/api';
import { newClientReference } from '@/lib/clientReference';
import { formatNumber } from '@/lib/format';

import { isStockoutClosed, stockoutStatus } from './orders';
import { useDeliverStock, useStockoutRiders, useStockouts } from './queries';

/** The picker's value for "nobody named"; the API takes no rider_id then. */
const NO_RIDER = 'none';

interface Props {
  storeId: string;
  stock: readonly ProductSummary[];
  initialReportId?: string;
  onClose: () => void;
}

/** Dispatch against a stockout report, in catalogue units. The server chooses batches by expiry. */
export function DeliverStockDialog({ storeId, stock, initialReportId = '', onClose }: Props) {
  const reports = useStockouts();
  const products = useProducts();
  const delivery = useDeliverStock();
  const [reportId, setReportId] = useState(initialReportId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [exception, setException] = useState('');
  const [riderId, setRiderId] = useState(NO_RIDER);
  const [reference] = useState(newClientReference);
  const [tried, setTried] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const availableReports =
    reports.data?.filter(
      (report) => report.district_store_id === storeId && !isStockoutClosed(stockoutStatus(report)),
    ) ?? [];
  const report = availableReports.find((item) => item.id === reportId);
  // Only delivery agents working in the hotspot's district are offered (and accepted by the API).
  const riders = useStockoutRiders(report ? reportId : '');
  const choices = (products.data ?? []).flatMap((product) => {
    if (
      !report ||
      !product.active ||
      !product.unit ||
      !product.pieces_per_unit ||
      !product.category ||
      (report.selection !== 'both' && report.selection !== product.category)
    )
      return [];
    const balance = stock.find(
      (item) => item.condom_id === product.id && item.unit_of_measure_id === product.unit?.id,
    );
    return balance && balance.usable > 0 ? [{ product, balance }] : [];
  });
  const lines = choices.filter(({ product }) => (quantities[product.id] ?? '').trim() !== '');
  const invalidProducts = new Set(
    lines
      .filter(({ product, balance }) => {
        const entered = quantities[product.id] ?? '';
        const quantity = Number(entered);
        return (
          !/^\d+$/.test(entered) ||
          !Number.isSafeInteger(quantity) ||
          quantity < 1 ||
          quantity > Math.min(balance.usable, 1_000_000)
        );
      })
      .map(({ product }) => product.id),
  );
  const busy = delivery.isPending;
  const locked = busy || uncertain;
  const loadError = reports.error ?? products.error;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (
      busy ||
      !report ||
      invalidProducts.size > 0 ||
      lines.length === 0 ||
      lines.length > 20 ||
      loadError
    )
      return;
    delivery.mutate(
      {
        reportId,
        input: {
          client_reference: reference,
          lines: lines.map(({ product, balance }) => ({
            condom_id: product.id,
            unit_of_measure_id: balance.unit_of_measure_id,
            quantity: Number(quantities[product.id]),
          })),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(riderId !== NO_RIDER ? { rider_id: riderId } : {}),
          ...(exception.trim() ? { expiry_exception_reason: exception.trim() } : {}),
        },
      },
      {
        onSuccess: onClose,
        onError: (error) => {
          // Retry the same dispatch after an ambiguous failure; changing its quantities could
          // otherwise silently replay an already-saved delivery under the same reference.
          const kind = toApiError(error).kind;
          setUncertain(
            !['validation', 'conflict', 'forbidden', 'not_found', 'rate_limited'].includes(kind),
          );
        },
      },
    );
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Dispatch to hotspot"
      description="Enter the stock you’re sending. Batches leave in expiry order, starting with the earliest. The hotspot manager confirms receipt."
      submitLabel="Record dispatch"
      pendingLabel="Recording…"
      isPending={busy}
      isDirty={Boolean(reportId || note || exception || riderId !== NO_RIDER)}
      onSubmit={submit}
      error={
        delivery.error
          ? getErrorMessage(delivery.error)
          : tried && lines.length === 0
            ? 'Enter a quantity for at least one product.'
            : tried && lines.length > 20
              ? 'Send at most 20 products in one dispatch.'
              : null
      }
    >
      {uncertain ? (
        <p className="text-muted-foreground text-sm sm:col-span-2">
          The dispatch result is unconfirmed. Retry these same details to check or save it once.
          Before starting another dispatch, check the movement history.
        </p>
      ) : null}
      {loadError ? (
        <div className="sm:col-span-2">
          <ErrorState
            title="Could not load dispatch options"
            error={loadError}
            onRetry={() => {
              void reports.refetch();
              void products.refetch();
            }}
          />
        </div>
      ) : null}
      {reports.isSuccess && availableReports.length === 0 ? (
        <div className="sm:col-span-2">
          <EmptyState
            icon={Package}
            title="No open hotspot stockouts"
            description="A hotspot manager must report a stockout before stock can be dispatched here."
          />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <SelectField
          label="Hotspot stockout"
          required
          value={reportId}
          onValueChange={(value) => {
            setReportId(value);
            setQuantities({});
            setRiderId(NO_RIDER);
          }}
          options={availableReports.map((item) => ({
            value: item.id,
            label: `${item.hot_spot.name} · ${item.product}`,
          }))}
          placeholder="Choose a hotspot notification"
          isLoading={reports.isPending}
          disabled={locked || Boolean(initialReportId)}
          error={tried && !report ? 'Choose a hotspot notification.' : undefined}
        />
      </div>
      {report?.status === 'awaiting_acknowledgement' || report?.status === 'partly_received' ? (
        <div className="border-warning/25 bg-warning/10 flex items-start gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
          <CircleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Stock has already been sent for this report. Check its dispatch history before sending
            more.
          </p>
        </div>
      ) : null}
      {report && !products.isPending && choices.length === 0 ? (
        <div className="sm:col-span-2">
          <EmptyState
            icon={Package}
            title="No matching stock available"
            description="Receive stock for the requested category, or check that its product has a catalogue unit and pack size."
          />
        </div>
      ) : null}
      {choices.length > 0 ? (
        <section
          aria-labelledby="dispatch-quantities"
          className="bg-secondary/40 space-y-3 rounded-lg border p-3 sm:col-span-2 sm:p-4"
        >
          <div className="space-y-1">
            <h3 id="dispatch-quantities" className="text-sm font-semibold">
              Stock to send
            </h3>
            <p className="text-muted-foreground text-sm">
              Enter quantities in the unit shown. Leave a quantity blank to skip that product.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {choices.map(({ product, balance }) => (
              <TextField
                key={product.id}
                label={`${productName(product)} (${balance.unit})`}
                type="number"
                inputMode="numeric"
                placeholder="Enter quantity"
                min={1}
                max={Math.min(balance.usable, 1_000_000)}
                step={1}
                disabled={locked}
                value={quantities[product.id] ?? ''}
                onChange={(event) => {
                  setQuantities((current) => ({ ...current, [product.id]: event.target.value }));
                }}
                description={`${formatNumber(balance.usable)} ${balance.unit} available`}
                error={
                  tried && invalidProducts.has(product.id)
                    ? `Enter a whole number from 1 to ${formatNumber(Math.min(balance.usable, 1_000_000))}.`
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}
      {report ? (
        <h3 className="border-t pt-3 text-sm font-semibold sm:col-span-2">Delivery details</h3>
      ) : null}
      {report ? (
        <div className="sm:col-span-2">
          <SelectField
            label="Delivery agent (optional)"
            value={riderId}
            onValueChange={setRiderId}
            options={[
              { value: NO_RIDER, label: 'No delivery agent' },
              ...(riders.data ?? []).map((rider) => ({
                value: rider.id,
                label: rider.phone ? `${rider.name} · ${rider.phone}` : rider.name,
              })),
            ]}
            placeholder="No delivery agent"
            isLoading={riders.isPending}
            loadError={riders.error ? 'Could not load the delivery agents' : undefined}
            disabled={locked}
            description={
              riders.isSuccess && riders.data.length === 0
                ? `No delivery agents work in ${report.hot_spot.district ?? 'this district'} yet.`
                : 'Only delivery agents in the hotspot’s district are listed. They see this dispatch in the field app.'
            }
            error={
              delivery.error ? toApiError(delivery.error).fieldErrors.rider_id?.[0] : undefined
            }
          />
        </div>
      ) : null}
      <TextField
        label="Delivery note"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
        maxLength={4000}
        disabled={locked}
      />
      <TextField
        label="Short-expiry exception reason"
        value={exception}
        onChange={(event) => {
          setException(event.target.value);
        }}
        maxLength={1000}
        disabled={locked}
        description="Required if a batch with under one month left will be sent."
      />
    </FormDialog>
  );
}
