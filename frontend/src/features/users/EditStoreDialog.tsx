import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ComboboxField, type ComboboxOption } from '@/components/form/ComboboxField';
import { FormDialog } from '@/components/form/FormDialog';
import { formLevelError } from '@/components/form/serverErrors';
import type { Store } from '@/features/geography/api';
import { useStores } from '@/features/geography/queries';
import { getErrorMessage } from '@/lib/api';

import type { User } from './api';
import { useSetUserStore } from './queries';
import { storeLabel, storeNeedOf, storesFor } from './stores';
import { userDisplayName } from './userForm';

interface EditStoreDialogProps {
  user: User;
  onClose: () => void;
  /** Where focus goes on close; see `FormDialog`. */
  onCloseAutoFocus?: (event: Event) => void;
}

interface StoreForm {
  /** A store id, or `NO_STORE`. */
  store_id: string;
}

const NO_STORE = 'none';
const STORE_FIELDS = ['store_id'] as const;

function storeOption(store: Store): ComboboxOption {
  // District stores are named after their district; one with its own name keeps it as a hint.
  return store.store_type === 'district' && store.name !== store.district_name
    ? { value: store.id, label: storeLabel(store), hint: store.name }
    : { value: store.id, label: storeLabel(store) };
}

/** Why a role works at the stores offered, shown under the title. */
function descriptionFor(kind: 'district' | 'national' | null): string {
  if (kind === 'district') {
    return "A district focal person or delivery agent works at their district's store. They see its orders and stock.";
  }
  if (kind === 'national') {
    return 'Warehouse staff work at their national warehouse. They see its orders and stock.';
  }
  return 'Their roles do not need a store. Assign one only if they should see a store’s orders and stock.';
}

/** Sets or clears the store a user works at (`PATCH /users/:id/store`). Mount it to open. */
export function EditStoreDialog({ user, onClose, onCloseAutoFocus }: EditStoreDialogProps) {
  const stores = useStores();
  const setStore = useSetUserStore(user.id);
  const need = storeNeedOf(user.roles.map((role) => role.name));
  const {
    control,
    handleSubmit,
    setError,
    formState: { isDirty },
  } = useForm<StoreForm>({ defaultValues: { store_id: user.store_id ?? NO_STORE } });
  const [formError, setFormError] = useState<string | null>(null);

  const options = useMemo<ComboboxOption[]>(() => {
    const offered = storesFor(need, stores.data ?? []).map(storeOption);
    // Keep a current store of another kind listed, so opening the dialog never hides it.
    const current = stores.data?.find((store) => store.id === user.store_id);
    if (current && !offered.some((option) => option.value === current.id)) {
      offered.unshift(storeOption(current));
    }
    return [{ value: NO_STORE, label: 'No store' }, ...offered];
  }, [need, stores.data, user.store_id]);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setStore.mutate(values.store_id === NO_STORE ? null : values.store_id, {
      onSuccess: onClose,
      onError: (error) => {
        setFormError(formLevelError(error, STORE_FIELDS, setError));
      },
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Store for ${userDisplayName(user)}`}
      description={descriptionFor(need?.kind ?? null)}
      submitLabel="Save store"
      pendingLabel="Saving…"
      isPending={setStore.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <Controller
        control={control}
        name="store_id"
        render={({ field, fieldState }) => (
          <ComboboxField
            label="Store"
            // Always answered: "No store" is one of the choices.
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={options}
            placeholder="Choose a store…"
            searchLabel="Search by store or district"
            noun="stores"
            isLoading={stores.isPending}
            loadError={stores.error ? getErrorMessage(stores.error) : undefined}
            error={fieldState.error?.message}
            className="sm:col-span-2"
          />
        )}
      />
    </FormDialog>
  );
}
