'use client';

import { useId, useState, type SyntheticEvent } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormDialog } from '@/components/form/FormDialog';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StockBatch } from '@/features/inventory/api';
import { getErrorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';

import { ADJUSTMENT_KINDS, adjustmentNote, type AdjustmentKind } from './stock';
import { useAdjustBatch, useDeleteBatch } from './stockQueries';

interface DeleteBatchDialogProps {
  batch: StockBatch;
  /** The store's code, e.g. "NMS". */
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, since the menu item that opened the dialog has gone. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Deletes a batch. Nothing has gone out of an untouched batch, so it is erased as if it was never
 * registered. Once stock has left a batch its history stays: what is left is written off, with the
 * reason and a note, and the batch leaves the list.
 */
export function DeleteBatchDialog(props: DeleteBatchDialogProps) {
  return props.batch.untouched ? <EraseBatch {...props} /> : <WriteOffBatch {...props} />;
}

function name(batch: StockBatch): string {
  return batch.batch_number ? `batch ${batch.batch_number}` : 'the stock with no batch number';
}

function EraseBatch({ batch, code, open, onOpenChange, onCloseAutoFocus }: DeleteBatchDialogProps) {
  const erase = useDeleteBatch();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!erase.isPending) onOpenChange(next);
      }}
      title={batch.batch_number ? `Delete batch ${batch.batch_number}?` : 'Delete this stock?'}
      description={`Nothing has gone out of it yet, so it is removed as if it was never registered: ${formatNumber(
        batch.on_hand,
      )} ${batch.unit} of ${batch.product} come off ${code}'s stock and the registration leaves the movements. The audit log keeps a record. This can't be undone.`}
      confirmLabel="Delete batch"
      isPending={erase.isPending}
      error={erase.error}
      onConfirm={() => {
        erase.mutate(batch, {
          onSuccess: () => {
            onOpenChange(false);
          },
        });
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}

/** Why what is left of a batch leaves: a stock count is a correction, not a reason to remove it. */
const WRITE_OFF_KINDS = ADJUSTMENT_KINDS.filter((kind) => kind.value !== 'count');

function WriteOffBatch({ batch, open, onOpenChange, onCloseAutoFocus }: DeleteBatchDialogProps) {
  const label = batch.batch_number
    ? `Batch ${batch.batch_number}`
    : 'The stock with no batch number';
  const writeOff = useAdjustBatch({ successMessage: `${label} written off and removed.` });
  const noteId = useId();
  const [kind, setKind] = useState<AdjustmentKind | null>(
    batch.band === 'expired' ? 'expired' : null,
  );
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const kindError = kind === null ? 'Choose why the stock is leaving.' : undefined;
  const noteError = note.trim() === '' ? 'Say what happened to it.' : undefined;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (kind === null || noteError) {
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        form
          .querySelector<HTMLElement>('[aria-invalid="true"], fieldset[aria-describedby] input')
          ?.focus();
      });
      return;
    }
    if (writeOff.isPending) return;
    writeOff.mutate(
      {
        store_id: batch.store_id,
        condom_id: batch.condom_id,
        unit_of_measure_id: batch.unit_of_measure_id,
        reason: 'adjustment',
        quantity: -batch.on_hand,
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
      title={batch.batch_number ? `Delete batch ${batch.batch_number}` : 'Delete this stock'}
      description={`Some of ${name(batch)} has already gone out, so it can't be erased and its history stays. Deleting writes off the ${formatNumber(
        batch.on_hand,
      )} ${batch.unit} still held, and the batch leaves the list.`}
      submitLabel={`Write off ${formatNumber(batch.on_hand)} ${batch.unit}`}
      pendingLabel="Writing off…"
      destructive
      isPending={writeOff.isPending}
      isDirty={dirty}
      error={writeOff.error ? getErrorMessage(writeOff.error) : null}
      onSubmit={submit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className="flex flex-col gap-4 sm:col-span-2">
        <RadioCardGroup
          legend="Why it is leaving"
          options={WRITE_OFF_KINDS}
          value={kind}
          onValueChange={(value) => {
            setKind(value);
            setDirty(true);
          }}
          layout="row"
          error={tried ? kindError : undefined}
          disabled={writeOff.isPending}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>What happened</Label>
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
            placeholder="e.g. Cartons crushed in bay 4; disposed of on 20 Nov"
            disabled={writeOff.isPending}
          />
          {tried && noteError ? <FieldError id={`${noteId}-error`}>{noteError}</FieldError> : null}
        </div>
      </div>
    </FormDialog>
  );
}
