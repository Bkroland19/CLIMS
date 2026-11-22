'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useRef, useState, type SyntheticEvent } from 'react';

import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSkeleton } from '@/components/states/PageSkeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WriteAction } from '@/components/WriteAction';
import { packLabel, productName, type Lookup, type Product } from '@/features/catalogue/api';
import { useLookups, useProducts } from '@/features/catalogue/queries';
import type { Warehouse } from '@/features/orders/api';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';

import { useCurrentWarehouse } from './orderQueries';
import { WAREHOUSE_PATHS, withStore } from './paths';
import { checkDelivery, ugandaToday, type DeliveryFields } from './receiving';
import { StoreSwitch } from './StoreSwitch';
import { useRecordDelivery } from './stockQueries';

export default function ReceiveStockPage() {
  const { code, href, warehouse, ...stores } = useCurrentWarehouse();
  const products = useProducts();
  const units = useLookups('units');

  const failed = stores.error ?? products.error;
  if (failed) {
    return (
      <div className="bg-card rounded-card border">
        <ErrorState
          title="Could not load the warehouse and the products"
          error={failed}
          onRetry={() => {
            void stores.refetch();
            void products.refetch();
          }}
          isRetrying={products.isRefetching}
        />
      </div>
    );
  }
  if (!warehouse || !products.data) return <PageSkeleton layout="form" />;
  return (
    <div className="gap-section flex flex-col">
      <StoreSwitch store={code} hrefFor={(other) => withStore(WAREHOUSE_PATHS.receive, other)} />
      <DeliveryForm
        key={warehouse.id}
        code={code}
        warehouse={warehouse}
        stockHref={href(WAREHOUSE_PATHS.stock)}
        products={products.data.filter((product) => product.active)}
        units={(units.data ?? []).filter((unit) => unit.active)}
        unitsLoading={units.isPending}
      />
    </div>
  );
}

interface Recorded {
  id: string;
  label: string;
}

const EMPTY_BATCH = { batchNumber: '', expiryDate: '', quantity: '' };

/**
 * A delivery, one batch at a time: the product and unit stay chosen between batches, so a
 * delivery of several batches is quick to enter. Each saved batch is listed until the page closes.
 */
function DeliveryForm({
  code,
  warehouse,
  stockHref,
  products,
  units,
  unitsLoading,
}: {
  code: string;
  warehouse: Warehouse;
  stockHref: string;
  products: readonly Product[];
  units: readonly Lookup[];
  unitsLoading: boolean;
}) {
  const record = useRecordDelivery();
  const noteId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<DeliveryFields>({
    productId: '',
    unitId: '',
    ...EMPTY_BATCH,
  });
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [recorded, setRecorded] = useState<Recorded[]>([]);
  const today = useMemo(() => ugandaToday(new Date()), []);

  const check = checkDelivery(fields, today);
  const product = products.find((candidate) => candidate.id === fields.productId);
  const unitName = units.find((unit) => unit.id === fields.unitId)?.name ?? '';
  const serverField = (field: string) =>
    record.error instanceof ApiError ? record.error.fieldErrors[field]?.[0] : undefined;
  const shown = (field: keyof DeliveryFields) => (tried ? check.errors[field] : undefined);
  const set = (changes: Partial<DeliveryFields>) => {
    setFields((current) => ({ ...current, ...changes }));
  };

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (Object.keys(check.errors).length > 0 || check.quantity === null) {
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (record.isPending) return;
    const quantity = check.quantity;
    const batchNumber = fields.batchNumber.trim();
    record.mutate(
      {
        store_id: warehouse.id,
        condom_id: fields.productId,
        unit_of_measure_id: fields.unitId,
        reason: 'receipt',
        quantity,
        batch_number: batchNumber,
        expiry_date: fields.expiryDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: (movement) => {
          setRecorded((current) => [
            {
              id: movement.id,
              label: `${batchNumber} · ${formatNumber(quantity)} ${unitName} of ${product ? productName(product) : 'condoms'}, expires ${formatDate(fields.expiryDate)}`,
            },
            ...current,
          ]);
          // The next batch of the same delivery keeps the product, unit and note.
          set(EMPTY_BATCH);
          setTried(false);
          requestAnimationFrame(() => {
            formRef.current?.querySelector<HTMLInputElement>('input[name="batch_number"]')?.focus();
          });
        },
      },
    );
  }

  return (
    <div className="gap-section grid lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle asChild>
            <h2>Record a delivery at {code}</h2>
          </CardTitle>
          <CardDescription>
            Enter each batch as printed on the cartons. Stock leaves first expiry first out, so the
            expiry date decides which batch goes first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Product"
                required
                value={fields.productId}
                onValueChange={(productId) => {
                  const chosen = products.find((candidate) => candidate.id === productId);
                  // The unit starts as the product's catalogue unit.
                  set({ productId, unitId: chosen?.unit?.id ?? fields.unitId });
                }}
                options={products.map((candidate) => ({
                  value: candidate.id,
                  label: [productName(candidate), packLabel(candidate)].filter(Boolean).join(', '),
                }))}
                placeholder="Choose a product"
                error={shown('productId')}
                disabled={record.isPending}
              />
              <SelectField
                label="Unit"
                required
                value={fields.unitId}
                onValueChange={(unitId) => {
                  set({ unitId });
                }}
                options={units.map((unit) => ({ value: unit.id, label: unit.name }))}
                placeholder="Choose a unit"
                isLoading={unitsLoading}
                error={shown('unitId')}
                disabled={record.isPending}
              />
              <TextField
                label="Batch number"
                name="batch_number"
                required
                value={fields.batchNumber}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  set({ batchNumber: event.target.value });
                }}
                error={shown('batchNumber') ?? serverField('batch_number')}
                disabled={record.isPending}
              />
              <TextField
                label="Expiry date"
                type="date"
                required
                min={today}
                value={fields.expiryDate}
                onChange={(event) => {
                  set({ expiryDate: event.target.value });
                }}
                description={
                  check.shortShelf
                    ? 'Under six months of shelf life left: dispatch this batch first.'
                    : undefined
                }
                error={shown('expiryDate') ?? serverField('expiry_date')}
                disabled={record.isPending}
              />
              <TextField
                label="Quantity received"
                required
                inputMode="numeric"
                value={fields.quantity}
                onChange={(event) => {
                  set({ quantity: event.target.value });
                }}
                description={unitName ? `In ${unitName}.` : undefined}
                error={shown('quantity')}
                disabled={record.isPending}
                className="max-w-40 text-right tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>
                Where it came from{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id={noteId}
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                placeholder="e.g. UNFPA consignment, delivery note DN-118"
                disabled={record.isPending}
              />
            </div>
            {record.error ? (
              <Alert variant="destructive">
                <AlertTitle>The batch was not recorded</AlertTitle>
                <AlertDescription>{getErrorMessage(record.error)}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" asChild>
                <Link href={stockHref}>{recorded.length > 0 ? 'Done' : 'Cancel'}</Link>
              </Button>
              <WriteAction>
                <Button type="submit" disabled={record.isPending}>
                  {record.isPending ? 'Saving…' : 'Record this batch'}
                </Button>
              </WriteAction>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:self-start">
        <CardHeader>
          <CardTitle asChild>
            <h2>Recorded now</h2>
          </CardTitle>
          <CardDescription>Batches saved since you opened this page.</CardDescription>
        </CardHeader>
        <CardContent>
          {recorded.length === 0 ? (
            <p className="text-muted-foreground text-sm">None yet.</p>
          ) : (
            <ul aria-label="Batches recorded" className="flex flex-col gap-2 text-sm">
              {recorded.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
