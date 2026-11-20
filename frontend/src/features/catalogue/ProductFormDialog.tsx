import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/lib/api';

import { categoryLabel, PRODUCT_CATEGORIES, type Unit } from './api';
import {
  PRODUCT_DEFAULTS,
  PRODUCT_FIELDS,
  productSchema,
  toNewProductInput,
  type ProductFormInput,
  type ProductFormOutput,
} from './catalogueForms';
import { useCreateProduct } from './queries';

interface ProductFormDialogProps {
  units: readonly Unit[] | undefined;
  isLoadingUnits: boolean;
  unitsError: unknown;
  onClose: () => void;
}

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((category) => ({
  value: category,
  label: categoryLabel(category),
}));

/** Adds a product to the catalogue. Mount it to open; `onClose` unmounts it. */
export function ProductFormDialog({
  units,
  isLoadingUnits,
  unitsError,
  onClose,
}: ProductFormDialogProps) {
  const createProduct = useCreateProduct();
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: PRODUCT_DEFAULTS,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    createProduct.mutate(toNewProductInput(values), {
      onSuccess: onClose,
      onError: (error) => {
        setFormError(formLevelError(error, PRODUCT_FIELDS, setError));
      },
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Add a product"
      description="Category, brand and type together identify a product. Each unit it comes in is its own entry."
      submitLabel="Add product"
      pendingLabel="Adding…"
      isPending={createProduct.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="category"
        render={({ field, fieldState }) => (
          <SelectField
            label="Category"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={CATEGORY_OPTIONS}
            placeholder="Choose a category…"
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Brand"
        required
        autoComplete="off"
        placeholder="e.g. Engabu"
        error={errors.brand?.message}
        {...register('brand')}
      />
      <TextField
        label="Type"
        required
        autoComplete="off"
        placeholder="e.g. Standard"
        error={errors.type?.message}
        {...register('type')}
      />
      <Controller
        control={control}
        name="unit_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Unit of measure"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={(units ?? []).map((unit) => ({ value: unit.id, label: unit.name }))}
            placeholder="Choose a unit…"
            isLoading={isLoadingUnits}
            loadError={unitsError ? getErrorMessage(unitsError) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Condoms per unit"
        required
        inputMode="numeric"
        autoComplete="off"
        error={errors.pieces_per_unit?.message}
        {...register('pieces_per_unit')}
      />
      <TextField
        label="Minimum stock (pieces)"
        inputMode="numeric"
        autoComplete="off"
        description="A store holding fewer pieces than this is flagged below minimum."
        error={errors.minimum_level?.message}
        {...register('minimum_level')}
      />
    </FormDialog>
  );
}
