import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';

import type { Lookup, LookupKind } from './api';
import {
  LOOKUP_FIELDS,
  lookupDefaults,
  lookupSchema,
  toLookupInput,
  toLookupPatch,
  type LookupForm,
} from './catalogueForms';
import { LOOKUP_TEXT } from './lookupKinds';
import { useCreateLookup, useUpdateLookup } from './queries';

interface LookupFormDialogProps {
  kind: LookupKind;
  /** The brand or unit to edit; leave out to add one. */
  lookup?: Lookup;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** Adds a brand or unit of measure, or edits `lookup`. Mount it to open; `onClose` unmounts it. */
export function LookupFormDialog({
  kind,
  lookup,
  onClose,
  onCloseAutoFocus,
}: LookupFormDialogProps) {
  const text = LOOKUP_TEXT[kind];
  const createLookup = useCreateLookup(kind);
  const updateLookup = useUpdateLookup(kind);
  const mutation = lookup ? updateLookup : createLookup;
  const schema = useMemo(() => lookupSchema(kind), [kind]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<LookupForm>({ resolver: zodResolver(schema), defaultValues: lookupDefaults(lookup) });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const onError = (error: unknown) => {
      setFormError(formLevelError(error, LOOKUP_FIELDS, setError));
    };
    if (lookup) {
      updateLookup.mutate(
        { id: lookup.id, patch: toLookupPatch(values) },
        { onSuccess: onClose, onError },
      );
    } else {
      createLookup.mutate(toLookupInput(values), { onSuccess: onClose, onError });
    }
  });

  const label = text.singular.charAt(0).toUpperCase() + text.singular.slice(1);
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={lookup ? `Edit ${lookup.name}` : `Add a ${text.singular}`}
      description={
        lookup
          ? `A new name shows on every product that uses this ${text.singular}.`
          : `Names are unique, whatever their capitals.`
      }
      submitLabel={lookup ? 'Save changes' : `Add ${text.singular}`}
      pendingLabel={lookup ? 'Saving…' : 'Adding…'}
      isPending={mutation.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <TextField
        label={`${label} name`}
        required
        autoComplete="off"
        placeholder={text.example}
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Note"
        autoComplete="off"
        placeholder={text.noteExample}
        error={errors.note?.message}
        {...register('note')}
      />
    </FormDialog>
  );
}
