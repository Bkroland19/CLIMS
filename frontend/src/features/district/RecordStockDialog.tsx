import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextareaField } from '@/components/form/TextareaField';
import { TextField } from '@/components/form/TextField';
import { RadioCardGroup } from '@/components/RadioCardGroup';
import { productName } from '@/features/catalogue/api';
import { useLookups, useProducts } from '@/features/catalogue/queries';
import { getErrorMessage } from '@/lib/api';

import { stockSchema, toMovementInput, type StockValues } from './forms';
import { useRecordMovement } from './queries';

const FIELDS = ['reason', 'condom_id', 'unit_of_measure_id', 'quantity', 'note'] as const;

interface RecordStockDialogProps {
  /** The store the record is for: the DCFP's own. */
  storeId: string;
  onClose: () => void;
}

/**
 * Records stock that did not come through an order: a receipt (stock that
 * arrived, e.g. an opening balance) or an adjustment after a count, which must
 * say why. Shown only to someone with `inventory:manage`.
 */
export function RecordStockDialog({ storeId, onClose }: RecordStockDialogProps) {
  const record = useRecordMovement();
  const products = useProducts();
  const units = useLookups('units');
  const [failure, setFailure] = useState<string | null>(null);
  const { control, register, handleSubmit, setError, formState } = useForm<StockValues>({
    resolver: zodResolver(stockSchema),
    defaultValues: {
      reason: 'receipt',
      condom_id: '',
      unit_of_measure_id: '',
      quantity: '',
      note: '',
    },
  });
  const isAdjustment = useWatch({ control, name: 'reason' }) === 'adjustment';

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Record stock"
      description="For stock that did not come through a warehouse request. Each record is kept in the ledger."
      submitLabel="Record stock"
      pendingLabel="Recording…"
      isPending={record.isPending}
      isDirty={formState.isDirty}
      error={failure}
      onSubmit={handleSubmit((values) => {
        const input = toMovementInput(storeId, values);
        if (!input) return;
        setFailure(null);
        record.mutate(input, {
          onSuccess: onClose,
          onError: (error) => {
            setFailure(formLevelError(error, FIELDS, setError));
          },
        });
      })}
    >
      <Controller
        control={control}
        name="reason"
        render={({ field, fieldState }) => (
          <RadioCardGroup
            className="sm:col-span-2"
            legend="What are you recording?"
            layout="row"
            value={field.value}
            onValueChange={field.onChange}
            error={fieldState.error?.message}
            options={[
              {
                value: 'receipt',
                label: 'Receipt',
                description: 'Stock that arrived, such as an opening balance',
              },
              {
                value: 'adjustment',
                label: 'Adjustment',
                description: 'A correction after a count, up or down, with the reason',
              },
            ]}
          />
        )}
      />
      <Controller
        control={control}
        name="condom_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Product"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={(products.data ?? [])
              .filter((product) => product.active)
              .map((product) => ({ value: product.id, label: productName(product) }))}
            placeholder="Choose a product…"
            isLoading={products.isPending}
            loadError={products.error ? getErrorMessage(products.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="unit_of_measure_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Unit"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={(units.data ?? [])
              .filter((unit) => unit.active)
              .map((unit) => ({ value: unit.id, label: unit.name }))}
            placeholder="Choose a unit…"
            isLoading={units.isPending}
            loadError={units.error ? getErrorMessage(units.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label={isAdjustment ? 'Change' : 'Quantity'}
        required
        inputMode={isAdjustment ? 'text' : 'numeric'}
        autoComplete="off"
        description={
          isAdjustment
            ? 'Positive to add stock, negative to remove it, for example −4.'
            : 'How many arrived, in the unit you chose.'
        }
        error={formState.errors.quantity?.message}
        {...register('quantity')}
      />
      <TextareaField
        label="Note"
        required={isAdjustment}
        description={
          isAdjustment ? 'Say why the stock changed.' : 'Where the stock came from, if useful.'
        }
        error={formState.errors.note?.message}
        {...register('note')}
      />
    </FormDialog>
  );
}
