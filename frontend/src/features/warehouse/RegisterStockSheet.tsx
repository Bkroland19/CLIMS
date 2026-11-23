'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { ErrorState } from '@/components/states/ErrorState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { packLabel, productName } from '@/features/catalogue/api';
import { useLookups, useProducts } from '@/features/catalogue/queries';
import type { Warehouse } from '@/features/orders/api';
import { getErrorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';

import { checkReceipt, lineOfError, ugandaToday, type DeliveryFields } from './receiving';
import { useRecordReceipt } from './stockQueries';
import { formatAmounts, type UnitAmount } from './summary';

interface Line extends DeliveryFields {
  /** Stable across removals, for React and for focusing. */
  key: number;
}

const blank = (key: number, productId = '', unitId = ''): Line => ({
  key,
  productId,
  unitId,
  batchNumber: '',
  expiryDate: '',
  quantity: '',
});

const untouched = (line: Line) =>
  !line.batchNumber.trim() && !line.expiryDate && !line.quantity.trim();

const isBlank = (line: Line) =>
  !line.productId && !line.batchNumber && !line.expiryDate && !line.quantity;

interface RegisterStockSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "JMS". */
  code: string;
  warehouse: Warehouse | undefined;
  /** A product to start an empty form with, when opened from a product's row. */
  startProductId?: string | null;
}

/**
 * Registers stock at the warehouse without leaving the stock page: each batch as printed on
 * its cartons, all saved together or none. The product and unit carry over to the next batch.
 * What has been typed stays if the panel is closed, until it is saved or started over.
 */
export function RegisterStockSheet({
  open,
  onOpenChange,
  code,
  warehouse,
  startProductId,
}: RegisterStockSheetProps) {
  const products = useProducts();
  const units = useLookups('units');
  const record = useRecordReceipt();
  const formId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>(() => [blank(0)]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const today = useMemo(() => ugandaToday(new Date()), []);

  const active = useMemo(
    () => (products.data ?? []).filter((product) => product.active),
    [products.data],
  );
  const activeUnits = useMemo(() => (units.data ?? []).filter((unit) => unit.active), [units.data]);
  const unitName = (id: string) => activeUnits.find((unit) => unit.id === id)?.name ?? '';
  // A batch added and left empty (its product carries over by itself) is not registered.
  const counted = lines.some((line) => !untouched(line))
    ? lines.filter((line) => !untouched(line))
    : lines.slice(0, 1);
  const check = checkReceipt(counted, today);
  const checkOf = new Map(counted.map((line, index) => [line.key, check.lines[index]]));
  const dirty = note.trim() !== '' || lines.some((line) => !isBlank(line));
  const failed = record.error ? lineOfError(getErrorMessage(record.error)) : null;
  const failedKey = failed ? counted[failed.index]?.key : undefined;
  const failedNumber = lines.findIndex((line) => line.key === failedKey) + 1;

  // Opened from a product's row: an untouched form starts with that product and its unit. This
  // adjusts state while rendering, once per opening, rather than in an effect.
  const start =
    open && startProductId
      ? products.data?.find((candidate) => candidate.id === startProductId)
      : undefined;
  const [started, setStarted] = useState<string | null>(null);
  if ((start?.id ?? null) !== started) {
    setStarted(start?.id ?? null);
    const first = lines[0];
    if (start && lines.length === 1 && first && isBlank(first)) {
      setLines([{ ...first, productId: start.id, unitId: start.unit?.id ?? '' }]);
    }
  }

  const focusLater = (selector: string) => {
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  };

  const update = (key: number, changes: Partial<DeliveryFields>) => {
    if (record.error) record.reset();
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  };

  const addLine = () => {
    const last = lines.at(-1);
    const key = nextKey.current++;
    setLines((current) => [...current, blank(key, last?.productId, last?.unitId)]);
    // The product carries over, so the next thing to type is the batch number.
    focusLater(`[data-line-key="${String(key)}"] input[name="batch_number"]`);
  };

  const removeLine = (key: number, index: number) => {
    if (record.error) record.reset();
    setLines((current) => current.filter((line) => line.key !== key));
    const neighbour = lines[index + 1] ?? lines[index - 1];
    if (neighbour)
      focusLater(`[data-line-key="${String(neighbour.key)}"] input[name="batch_number"]`);
  };

  const startOver = () => {
    record.reset();
    setLines([blank(nextKey.current++)]);
    setNote('');
    setTried(false);
  };

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (!check.valid) {
      focusLater('[aria-invalid="true"]');
      return;
    }
    if (!warehouse || record.isPending) return;
    const sent = counted.map((line, index) => ({
      condom_id: line.productId,
      unit_of_measure_id: line.unitId,
      batch_number: line.batchNumber.trim(),
      expiry_date: line.expiryDate,
      quantity: check.lines[index]?.quantity ?? 0,
    }));
    record.mutate(
      { store_id: warehouse.id, lines: sent, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          const amounts = totals(counted, check.lines, unitName);
          toast.success(
            `Stock registered at ${code}: ${batches(counted.length)}, ${formatAmounts(amounts)}.`,
          );
          startOver();
          onOpenChange(false);
        },
        onError: (error) => {
          const line = lineOfError(getErrorMessage(error));
          const key = line ? counted[line.index]?.key : undefined;
          if (key !== undefined)
            focusLater(`[data-line-key="${String(key)}"] input[name="batch_number"]`);
        },
      },
    );
  }

  const amounts = totals(counted, check.lines, unitName);
  const loading = products.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg font-semibold">Register stock at {code}</SheetTitle>
          <SheetDescription>
            Enter each batch as printed on the cartons. All the batches are registered together.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {products.error ? (
            <ErrorState
              title="Could not load the products"
              error={products.error}
              onRetry={() => void products.refetch()}
              isRetrying={products.isRefetching}
            />
          ) : loading ? (
            <div className="flex flex-col gap-3" role="status">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-40 w-full" />
              <span className="sr-only">Loading products…</span>
            </div>
          ) : (
            <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
              <TextField
                label="Source"
                value={note}
                maxLength={1000}
                autoComplete="off"
                placeholder="e.g. UNFPA consignment, delivery note DN-118"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
                disabled={record.isPending}
              />

              <ol ref={listRef} aria-label="Batches to register" className="flex flex-col">
                {lines.map((line, index) => {
                  const lineCheck = checkOf.get(line.key);
                  const shown = (field: keyof DeliveryFields) =>
                    tried ? lineCheck?.errors[field] : undefined;
                  const unit = unitName(line.unitId);
                  return (
                    <li
                      key={line.key}
                      data-line-key={line.key}
                      className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0"
                    >
                      <div className="flex min-h-7 items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">Batch {index + 1}</h3>
                        {lines.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove batch ${String(index + 1)}`}
                            onClick={() => {
                              removeLine(line.key, index);
                            }}
                            disabled={record.isPending}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                        <div className="sm:col-span-2">
                          <SelectField
                            label="Product"
                            required
                            value={line.productId}
                            onValueChange={(productId) => {
                              const chosen = active.find((candidate) => candidate.id === productId);
                              // The unit starts as the product's catalogue unit.
                              update(line.key, {
                                productId,
                                unitId: chosen?.unit?.id ?? line.unitId,
                              });
                            }}
                            options={active.map((candidate) => ({
                              value: candidate.id,
                              label: [productName(candidate), packLabel(candidate)]
                                .filter(Boolean)
                                .join(', '),
                            }))}
                            placeholder="Choose a product"
                            error={shown('productId')}
                            disabled={record.isPending}
                          />
                        </div>
                        <TextField
                          label="Batch number"
                          name="batch_number"
                          required
                          value={line.batchNumber}
                          maxLength={60}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(event) => {
                            update(line.key, { batchNumber: event.target.value });
                          }}
                          error={shown('batchNumber')}
                          disabled={record.isPending}
                        />
                        <TextField
                          label="Expiry date"
                          type="date"
                          required
                          min={today}
                          value={line.expiryDate}
                          onChange={(event) => {
                            update(line.key, { expiryDate: event.target.value });
                          }}
                          description={
                            lineCheck?.shortShelf
                              ? 'Under six months left: this batch will go out first.'
                              : undefined
                          }
                          error={shown('expiryDate')}
                          disabled={record.isPending}
                        />
                        <TextField
                          label="Quantity received"
                          required
                          inputMode="numeric"
                          autoComplete="off"
                          value={line.quantity}
                          onChange={(event) => {
                            update(line.key, { quantity: event.target.value });
                          }}
                          description={unit ? `In ${unit}.` : undefined}
                          error={shown('quantity')}
                          disabled={record.isPending}
                          className="tabular-nums"
                        />
                        <SelectField
                          label="Unit"
                          required
                          value={line.unitId}
                          onValueChange={(unitId) => {
                            update(line.key, { unitId });
                          }}
                          options={activeUnits.map((candidate) => ({
                            value: candidate.id,
                            label: candidate.name,
                          }))}
                          placeholder="Choose a unit"
                          isLoading={units.isPending}
                          error={shown('unitId')}
                          disabled={record.isPending}
                        />
                      </div>
                      {failed && failedKey === line.key ? (
                        <Alert variant="destructive">
                          <AlertTitle>This batch was refused</AlertTitle>
                          <AlertDescription>{failed.message}</AlertDescription>
                        </Alert>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={addLine}
                disabled={record.isPending || lines.length >= 50}
              >
                <Plus data-icon="inline-start" />
                Add another batch
              </Button>

              {record.error ? (
                <Alert variant="destructive">
                  <AlertTitle>Nothing was registered</AlertTitle>
                  <AlertDescription>
                    {failed
                      ? `Batch ${String(failedNumber)} was refused, so none of the stock was registered. Correct it and register again.`
                      : getErrorMessage(record.error)}
                  </AlertDescription>
                </Alert>
              ) : null}
            </form>
          )}
        </div>

        <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-between gap-3 border-t">
          <p className="text-muted-foreground min-w-0 text-sm" aria-live="polite">
            {batches(counted.length)}
            {amounts.length > 0 ? (
              <>
                {' · '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatAmounts(amounts)}
                </span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button type="button" variant="ghost" onClick={startOver} disabled={record.isPending}>
                Start over
              </Button>
            ) : null}
            <Button
              type="submit"
              form={formId}
              disabled={record.isPending || loading || Boolean(products.error)}
            >
              {record.isPending ? 'Registering…' : 'Register stock'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function batches(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'batch' : 'batches'}`;
}

/** What the lines with a valid quantity add up to, per unit. */
function totals(
  lines: readonly Line[],
  checks: readonly { quantity: number | null }[],
  unitName: (id: string) => string,
): UnitAmount[] {
  const byUnit = new Map<string, number>();
  lines.forEach((line, index) => {
    const quantity = checks[index]?.quantity;
    const unit = unitName(line.unitId);
    if (quantity && unit) byUnit.set(unit, (byUnit.get(unit) ?? 0) + quantity);
  });
  return [...byUnit.entries()].map(([unit, quantity]) => ({ unit, quantity }));
}
