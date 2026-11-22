import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/lib/api';
import { formatNumber } from '@/lib/format';

import { ActionForm } from './ActionForm';
import type { Rider, StockBalance } from './api';
import { sendQuantityError, sendSchema, toDispatchInput, type SendValues } from './forms';
import { useDispatchAlert, useRiders } from './queries';

const FIELDS = ['unit_of_measure_id', 'quantity', 'rider_id'] as const;

const riderLabel = (rider: Rider) => {
  const name = `${rider.first_name} ${rider.last_name}`.trim();
  if (rider.open_deliveries === 0) return name;
  const out =
    rider.open_deliveries === 1
      ? '1 delivery'
      : `${formatNumber(rider.open_deliveries)} deliveries`;
  return `${name} (${out} out)`;
};

interface SendFromStoreFormProps {
  alertId: string;
  /** The district store's balances of the alert's product, one per unit. */
  stock: readonly StockBalance[];
}

/**
 * Sends stock for an alert from the district store's available balance with a
 * rider (`dispatch`). Only units with stock available are offered.
 */
export function SendFromStoreForm({ alertId, stock }: SendFromStoreFormProps) {
  const riders = useRiders();
  const send = useDispatchAlert(alertId);
  const sendable = stock.filter((row) => row.available > 0);
  // The form's rules; what is available is checked on sending, against the balances as they are then.
  const schema = sendSchema(() => null);

  const { control, register, handleSubmit, setError, formState } = useForm<SendValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      unit_of_measure_id: sendable.length === 1 ? (sendable[0]?.unit_of_measure_id ?? '') : '',
      quantity: '',
      rider_id: '',
    },
  });
  const unitId = useWatch({ control, name: 'unit_of_measure_id' });
  const chosen = sendable.find((row) => row.unit_of_measure_id === unitId);

  // A refusal the API ties to a field is shown beside it; any other above the form.
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <ActionForm
      label="Send from the district store"
      submitLabel="Send stock"
      pendingLabel="Sending…"
      isPending={send.isPending}
      error={failure}
      onSubmit={handleSubmit((values) => {
        const available =
          sendable.find((row) => row.unit_of_measure_id === values.unit_of_measure_id)?.available ??
          null;
        const problem = sendQuantityError(values.quantity, available);
        if (problem) {
          setError('quantity', { type: 'validate', message: problem }, { shouldFocus: true });
          return;
        }
        const input = toDispatchInput(values);
        if (!input) return;
        setFailure(null);
        send.mutate(input, {
          onError: (error) => {
            setFailure(formLevelError(error, FIELDS, setError, { quantity_issued: 'quantity' }));
          },
        });
      })}
    >
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
            options={sendable.map((row) => ({
              value: row.unit_of_measure_id,
              label: `${row.unit} · ${formatNumber(row.available)} available`,
            }))}
            placeholder="Choose a unit…"
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Quantity"
        required
        inputMode="numeric"
        autoComplete="off"
        description={
          chosen
            ? `Up to ${formatNumber(chosen.available)} ${chosen.unit.toLowerCase()} available.`
            : 'In the unit you choose.'
        }
        error={formState.errors.quantity?.message}
        {...register('quantity')}
      />
      <Controller
        control={control}
        name="rider_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Rider"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={(riders.data ?? []).map((rider) => ({
              value: rider.id,
              label: riderLabel(rider),
            }))}
            placeholder="Choose a rider…"
            description={
              riders.data?.length === 0
                ? 'No riders work from your store. Ask an administrator to assign a delivery agent to it.'
                : 'Riders who take deliveries from your store.'
            }
            isLoading={riders.isPending}
            loadError={riders.error ? getErrorMessage(riders.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
    </ActionForm>
  );
}
