import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/lib/api';

import {
  categoryLabel,
  isComplete,
  PRODUCT_CATEGORIES,
  productName,
  type CatalogueRef,
  type Lookup,
  type Product,
} from './api';
import {
  PRODUCT_FIELDS,
  productDefaults,
  isPieceUnit,
  productSchemaForUnits,
  toProductInput,
  type ProductFormInput,
  type ProductFormOutput,
} from './catalogueForms';
import { useCreateProduct, useUpdateProduct } from './queries';

interface LookupOptions {
  data: readonly Lookup[] | undefined;
  isPending: boolean;
  error: unknown;
}

interface ProductFormDialogProps {
  /** The product to edit; leave out to add one. */
  product?: Product;
  types: LookupOptions;
  brands: LookupOptions;
  units: LookupOptions;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((category) => ({
  value: category,
  label: categoryLabel(category),
}));

/**
 * Active types, brands or units to choose from. One the product already has stays listed,
 * marked inactive, so editing other fields does not force a change.
 */
function lookupOptions(lookups: readonly Lookup[] | undefined, current: CatalogueRef | null) {
  const options = (lookups ?? [])
    .filter((lookup) => lookup.active || lookup.id === current?.id)
    .map((lookup) => ({
      value: lookup.id,
      label: lookup.active ? lookup.name : `${lookup.name} (inactive)`,
    }));
  if (current && !options.some((option) => option.value === current.id)) {
    options.push({ value: current.id, label: current.name });
  }
  return options;
}

/** Adds a product, or edits `product`. Mount it to open; `onClose` unmounts it. */
export function ProductFormDialog({
  product,
  types,
  brands,
  units,
  onClose,
  onCloseAutoFocus,
}: ProductFormDialogProps) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const mutation = product ? updateProduct : createProduct;
  const knownUnits: CatalogueRef[] = [...(units.data ?? [])];
  if (product?.unit && !knownUnits.some((unit) => unit.id === product.unit?.id)) {
    // The current unit remains usable while lookups load, including inactive units.
    knownUnits.push(product.unit);
  }
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(productSchemaForUnits(knownUnits)),
    defaultValues: productDefaults(product),
  });
  const unitId = useWatch({ control, name: 'unit_id' });
  const pieceUnit = isPieceUnit(knownUnits.find((unit) => unit.id === unitId));
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    const onError = (error: unknown) => {
      setFormError(formLevelError(error, PRODUCT_FIELDS, setError));
    };
    const input = toProductInput(values);
    if (product) {
      updateProduct.mutate({ id: product.id, patch: input }, { onSuccess: onClose, onError });
    } else {
      createProduct.mutate(input, { onSuccess: onClose, onError });
    }
  });

  let description =
    'Brand, category and type identify a product. Each unit it comes in is its own entry.';
  if (product && !isComplete(product)) {
    description =
      'This product came from the previous system without all its details. Fill in every field to save it.';
  } else if (product) {
    description = 'Changes apply wherever the product is shown, including past orders and stock.';
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={product ? `Edit ${productName(product)}` : 'Add a product'}
      description={description}
      submitLabel={product ? 'Save changes' : 'Add product'}
      pendingLabel={product ? 'Saving…' : 'Adding…'}
      isPending={mutation.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="brand_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Brand"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={lookupOptions(brands.data, product?.brand ?? null)}
            placeholder="Choose a brand…"
            description="Add a missing brand on the Brands tab."
            isLoading={brands.isPending}
            loadError={brands.error ? getErrorMessage(brands.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
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
      <Controller
        control={control}
        name="type_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="Type"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={lookupOptions(types.data, product?.type ?? null)}
            placeholder="Choose a type…"
            description="How the product reaches people. Add a missing type on the Types tab."
            isLoading={types.isPending}
            loadError={types.error ? getErrorMessage(types.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
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
            options={lookupOptions(units.data, product?.unit ?? null)}
            placeholder="Choose a unit…"
            isLoading={units.isPending}
            loadError={units.error ? getErrorMessage(units.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
      {!pieceUnit ? (
        <TextField
          label="Condoms per unit"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 144"
          error={errors.pieces_per_unit?.message}
          {...register('pieces_per_unit')}
        />
      ) : null}
    </FormDialog>
  );
}
