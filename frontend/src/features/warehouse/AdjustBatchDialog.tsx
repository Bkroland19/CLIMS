'use client';

import { useId, useState, type SyntheticEvent } from 'react';

import { FormDialog } from '@/components/form/FormDialog';
import { TextField } from '@/components/form/TextField';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StockBatch } from '@/features/inventory/api';
import { batchLabel } from '@/features/inventory/bands';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';

import {
  ADJUSTMENT_KINDS,
  adjustmentNote,
  checkAdjustment,
  signed,
  type AdjustmentKind,
} from './stock';
import { useAdjustBatch } from './stockQueries';

interface AdjustBatchDialogProps {
  batch: StockBatch;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, since the menu item that opened the dialog has gone. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Corrects one batch after a count, or writes off damaged, expired or lost stock, with a note
 * saying why. An expired batch opens on writing off what it holds.
 */
export function AdjustBatchDialog({
  batch,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: AdjustBatchDialogProps) {
  const adjust = useAdjustBatch();
  const noteId = useId();
  const expired = batch.band === 'expired';
  const [kind, setKind] = useState<AdjustmentKind>(expired ? 'expired' : 'count');
  const [entered, setEntered] = useState(String(batch.on_hand));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);

  const check = checkAdjustment(kind, entered, batch.on_hand);
  const noteError = note.trim() === '' ? 'Say why the stock changed.' : null;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (check.quantity === null || noteError) {
      // Focus the first field to fix once the attempt has marked it invalid.
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    if (adjust.isPending) return;
    adjust.mutate(
      {
        store_id: batch.store_id,
        condom_id: batch.condom_id,
        unit_of_measure_id: batch.unit_of_measure_id,
        reason: 'adjustment',
        quantity: check.quantity,
        note: adjustmentNote(kind, note),
        ...(batch.batch_number ? { batch_number: batch.batch_number } : {}),
        ...(batch.expiry_date ? { expiry_date: batch.expiry_date } : {}),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${kind === 'count' ? 'Adjust' : 'Write off'} ${batch.batch_number ? `batch ${batch.batch_number}` : 'stock with no batch number'}`}
      description={`${batch.product} · ${batch.unit}. Holds ${formatNumber(batch.on_hand)}${
        batch.expiry_date ? `; expires ${formatDate(batch.expiry_date)}` : '; expiry not recorded'
      }.`}
      submitLabel={kind === 'count' ? 'Record the count' : 'Write off'}
      pendingLabel="Saving…"
      isPending={adjust.isPending}
      isDirty={dirty}
      error={adjust.error ? getErrorMessage(adjust.error) : null}
      onSubmit={submit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="flex flex-col gap-4 sm:col-span-2">
        <RadioCardGroup
          legend="What happened"
          options={ADJUSTMENT_KINDS}
          value={kind}
          onValueChange={(value) => {
            setKind(value);
            setDirty(true);
            // A count starts from what is recorded, as does writing off an expired batch.
            setEntered(
              value === 'count' || (value === 'expired' && expired) ? String(batch.on_hand) : '',
            );
          }}
          layout="row"
          disabled={adjust.isPending}
        />
        <TextField
          label={kind === 'count' ? 'Counted on the shelf' : 'How many'}
          required
          inputMode="numeric"
          value={entered}
          onChange={(event) => {
            setEntered(event.target.value);
            setDirty(true);
          }}
          description={
            check.quantity !== null
              ? `Recorded as ${signed(check.quantity)} ${batch.unit} in ${batchLabel(batch)}.`
              : `In ${batch.unit}.`
          }
          error={tried ? (check.error ?? undefined) : undefined}
          disabled={adjust.isPending}
          className="max-w-40 tabular-nums"
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>Why</Label>
          <Textarea
            id={noteId}
            rows={2}
            maxLength={900}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setDirty(true);
            }}
            aria-required
            aria-invalid={tried && noteError ? true : undefined}
            aria-describedby={tried && noteError ? `${noteId}-error` : undefined}
            placeholder={
              kind === 'count' ? 'e.g. Quarterly stock count' : 'e.g. Water damage in bay 4'
            }
            disabled={adjust.isPending}
          />
          {tried && noteError ? <FieldError id={`${noteId}-error`}>{noteError}</FieldError> : null}
        </div>
      </div>
    </FormDialog>
  );
}
