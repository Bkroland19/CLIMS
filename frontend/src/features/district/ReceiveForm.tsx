import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { formLevelError } from '@/components/form/serverErrors';
import { TextareaField } from '@/components/form/TextareaField';
import { TextField } from '@/components/form/TextField';
import { formatNumber } from '@/lib/format';

import { ActionForm } from './ActionForm';
import { parseWholeNumber, receiveSchema, toReceiveInput, type ReceiveValues } from './forms';
import { useReceiveRequest } from './queries';

const FIELDS = ['quantity_received', 'discrepancy_note'] as const;

interface ReceiveFormProps {
  requestId: string;
  /** What the warehouse sent. */
  issued: number;
  /** The unit it was sent in, e.g. "Box". */
  unit: string | null;
}

/**
 * Records what arrived of a warehouse shipment (`receive`), crediting the
 * district store. The count starts at what was sent; a different count needs a
 * note saying what happened to the difference.
 */
export function ReceiveForm({ requestId, issued, unit }: ReceiveFormProps) {
  const receive = useReceiveRequest(requestId);
  const [failure, setFailure] = useState<string | null>(null);
  const { control, register, handleSubmit, setError, formState } = useForm<ReceiveValues>({
    resolver: zodResolver(receiveSchema(issued)),
    defaultValues: { quantity_received: String(issued), discrepancy_note: '' },
  });
  const counted = parseWholeNumber(useWatch({ control, name: 'quantity_received' }));
  const differs = counted !== null && counted !== issued;

  return (
    <ActionForm
      label="Receive the shipment"
      submitLabel="Receive shipment"
      pendingLabel="Receiving…"
      isPending={receive.isPending}
      error={failure}
      onSubmit={handleSubmit((values) => {
        const input = toReceiveInput(values);
        if (!input) return;
        setFailure(null);
        receive.mutate(input, {
          onError: (error) => {
            setFailure(formLevelError(error, FIELDS, setError));
          },
        });
      })}
    >
      <TextField
        label="Quantity received"
        required
        inputMode="numeric"
        autoComplete="off"
        description={`${formatNumber(issued)}${unit ? ` × ${unit}` : ''} were sent. Count what arrived.`}
        error={formState.errors.quantity_received?.message}
        {...register('quantity_received')}
      />
      <TextareaField
        label="What happened to the difference"
        required={differs}
        description={
          differs
            ? 'Needed when the count differs from what was sent.'
            : 'Only needed if the count differs.'
        }
        error={formState.errors.discrepancy_note?.message}
        {...register('discrepancy_note')}
      />
    </ActionForm>
  );
}
