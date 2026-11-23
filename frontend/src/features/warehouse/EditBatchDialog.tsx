'use client';

import { useId, useMemo, useState, type SyntheticEvent } from 'react';

import { FormDialog } from '@/components/form/FormDialog';
import { TextField } from '@/components/form/TextField';
import { FieldDescription, FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StockBatch } from '@/features/inventory/api';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';

import { ugandaToday } from './receiving';
import { checkBatchEdit, signed, type BatchEditFields } from './stock';
import { useEditBatch } from './stockQueries';

interface EditBatchDialogProps {
  batch: StockBatch;
  /** The batches the store holds, to warn before a number clashes with one or joins it. */
  held: readonly StockBatch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, since the menu item that opened the dialog has gone. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Corrects a batch as it was registered: its number, expiry date and the quantity on the shelf,
 * with a note saying why. A batch registered without a number or expiry gets both here.
 */
export function EditBatchDialog({
  batch,
  held,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: EditBatchDialogProps) {
  const edit = useEditBatch();
  const noteId = useId();
  const today = useMemo(() => ugandaToday(new Date()), []);
  const [fields, setFields] = useState<BatchEditFields>({
    batchNumber: batch.batch_number ?? '',
    expiryDate: batch.expiry_date ?? '',
    onHand: String(batch.on_hand),
    note: '',
  });
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);

  const check = checkBatchEdit(fields, batch, held, today);
  const shown = (field: keyof BatchEditFields) => (tried ? check.errors[field] : undefined);
  const update = (patch: Partial<BatchEditFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    const invalid = Object.keys(check.errors).length > 0;
    if (invalid || check.unchanged) {
      // Focus the first field to fix once the attempt has marked it invalid.
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (edit.isPending) return;
    edit.mutate(
      {
        batch,
        input: {
          batch_number: fields.batchNumber.trim(),
          expiry_date: fields.expiryDate,
          on_hand: Number(fields.onHand.trim()),
          note: fields.note.trim(),
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  const quantity = Number(fields.onHand.trim());
  const quantityHelp =
    check.delta === null || check.delta === 0
      ? `In ${batch.unit}. Holds ${formatNumber(batch.on_hand)} now.`
      : batch.untouched
        ? `Was ${formatNumber(batch.on_hand)}: ${signed(check.delta)} ${batch.unit}.`
        : `Was ${formatNumber(batch.on_hand)}: ${signed(check.delta)} ${batch.unit}, kept in the movements as a correction, since some of this batch has gone out.`;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        batch.batch_number ? `Edit batch ${batch.batch_number}` : 'Edit stock with no batch number'
      }
      description={`${batch.product} · ${batch.unit}. Holds ${formatNumber(batch.on_hand)}${
        batch.expiry_date ? `; expires ${formatDate(batch.expiry_date)}` : '; expiry not recorded'
      }.`}
      submitLabel="Save changes"
      pendingLabel="Saving…"
      isPending={edit.isPending}
      isDirty={dirty}
      error={edit.error ? getErrorMessage(edit.error) : null}
      onSubmit={submit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <TextField
        label="Batch number"
        required
        autoComplete="off"
        spellCheck={false}
        maxLength={60}
        value={fields.batchNumber}
        onChange={(event) => {
          update({ batchNumber: event.target.value });
        }}
        description={
          check.joins
            ? `Batch ${check.joins.batch_number ?? ''} with this expiry is already held (${formatNumber(
                check.joins.on_hand,
              )}). Saving makes them one batch${
                check.delta === null ? '' : ` of ${formatNumber(check.joins.on_hand + quantity)}`
              }.`
            : undefined
        }
        error={shown('batchNumber')}
        disabled={edit.isPending}
      />
      <TextField
        label="Expiry date"
        required
        type="date"
        value={fields.expiryDate}
        onChange={(event) => {
          update({ expiryDate: event.target.value });
        }}
        description={
          check.expired
            ? "This date has passed: the batch will count as expired and can't be dispatched."
            : undefined
        }
        error={shown('expiryDate')}
        disabled={edit.isPending}
      />
      <TextField
        label="Quantity on hand"
        required
        inputMode="numeric"
        autoComplete="off"
        value={fields.onHand}
        onChange={(event) => {
          update({ onHand: event.target.value });
        }}
        description={quantityHelp}
        error={shown('onHand')}
        disabled={edit.isPending}
        className="max-w-40 tabular-nums"
      />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={noteId}>Why</Label>
        <Textarea
          id={noteId}
          rows={2}
          maxLength={900}
          value={fields.note}
          onChange={(event) => {
            update({ note: event.target.value });
          }}
          aria-required
          aria-invalid={shown('note') ? true : undefined}
          aria-describedby={`${noteId}-help${shown('note') ? ` ${noteId}-error` : ''}`}
          placeholder="e.g. Batch number mistyped when the stock was registered"
          disabled={edit.isPending}
        />
        <FieldDescription id={`${noteId}-help`}>
          Kept with the change, so anyone checking the stock later can see why.
        </FieldDescription>
        {shown('note') ? <FieldError id={`${noteId}-error`}>{shown('note')}</FieldError> : null}
      </div>
      {tried && check.unchanged ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          Nothing has changed yet. Change the batch number, expiry date or quantity, or cancel.
        </p>
      ) : null}
    </FormDialog>
  );
}
