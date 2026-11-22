import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { useLookups } from '@/features/catalogue/queries';
import { useStores } from '@/features/geography/queries';
import { getErrorMessage } from '@/lib/api';

import { ActionForm } from './ActionForm';
import { askSchema, toReplenishmentInput, type AskValues } from './forms';
import { useRequestReplenishment } from './queries';

const FIELDS = ['warehouse_store_id', 'unit_of_measure_id', 'quantity'] as const;

/**
 * Asks a national warehouse for stock for an alert (`request-replenishment`).
 * The alert then waits on hold until the shipment is received and the DCFP
 * sends it. Only national warehouses are offered: the API refuses any other.
 */
export function AskWarehouseForm({ alertId }: { alertId: string }) {
  const stores = useStores();
  const units = useLookups('units');
  const ask = useRequestReplenishment(alertId);
  const [failure, setFailure] = useState<string | null>(null);
  const warehouses = (stores.data ?? []).filter((store) => store.store_type === 'national');

  const { control, register, handleSubmit, setError, formState } = useForm<AskValues>({
    resolver: zodResolver(askSchema),
    defaultValues: { warehouse_store_id: '', unit_of_measure_id: '', quantity: '' },
  });

  return (
    <ActionForm
      label="Ask the warehouse"
      submitLabel="Ask the warehouse"
      pendingLabel="Sending request…"
      isPending={ask.isPending}
      error={failure}
      onSubmit={handleSubmit((values) => {
        const input = toReplenishmentInput(values);
        if (!input) return;
        setFailure(null);
        ask.mutate(input, {
          onError: (error) => {
            setFailure(formLevelError(error, FIELDS, setError, { quantity: 'quantity' }));
          },
        });
      })}
    >
      <Controller
        control={control}
        name="warehouse_store_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Warehouse"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={warehouses.map((store) => ({ value: store.id, label: store.name }))}
            placeholder="Choose a warehouse…"
            isLoading={stores.isPending}
            loadError={stores.error ? getErrorMessage(stores.error) : undefined}
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
        label="Quantity"
        required
        inputMode="numeric"
        autoComplete="off"
        description="How many to ask for, in the unit you choose."
        error={formState.errors.quantity?.message}
        {...register('quantity')}
      />
    </ActionForm>
  );
}
