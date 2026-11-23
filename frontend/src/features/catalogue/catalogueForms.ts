import { z } from 'zod';

import { wholeNumber } from '@/lib/validation';

import {
  PRODUCT_CATEGORIES,
  type CatalogueRef,
  type Lookup,
  type LookupInput,
  type LookupKind,
  type LookupPatch,
  type Product,
  type ProductInput,
} from './api';

/*
 * The same rules the Go API enforces (`backend/internal/features/catalogue/dto.go`),
 * so a form only reaches the server with values it will accept.
 */

export const productSchema = z.object({
  // Strings first, so a form can start with nothing chosen ('').
  category: z.string().pipe(z.enum(PRODUCT_CATEGORIES, 'Choose a category.')),
  type_id: z.string().min(1, 'Choose a type.'),
  brand_id: z.string().min(1, 'Choose a brand.'),
  unit_id: z.string().min(1, 'Choose a unit of measure.'),
  pieces_per_unit: wholeNumber('how many condoms one unit holds', { min: 1, max: 100_000 }),
});

export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormOutput = z.output<typeof productSchema>;

export function isPieceUnit(unit: CatalogueRef | null | undefined): boolean {
  return /^(piece|pieces)$/i.test(unit?.name.trim() ?? '');
}

/** A piece is already one condom; package sizes still need explicit validation. */
export function productSchemaForUnits(units: readonly CatalogueRef[]) {
  return z.preprocess(
    (values: ProductFormInput) => ({
      ...values,
      pieces_per_unit: isPieceUnit(units.find((unit) => unit.id === values.unit_id))
        ? '1'
        : values.pieces_per_unit,
    }),
    productSchema,
  );
}

export const PRODUCT_FIELDS = [
  'category',
  'type_id',
  'brand_id',
  'unit_id',
  'pieces_per_unit',
] as const satisfies readonly (keyof ProductFormInput)[];

/** A new product's starting values, or an existing one's; missing legacy values start blank. */
export function productDefaults(product?: Product): ProductFormInput {
  return {
    category: product ? (product.category ?? '') : 'male',
    type_id: product?.type?.id ?? '',
    brand_id: product?.brand?.id ?? '',
    unit_id: product?.unit?.id ?? '',
    pieces_per_unit: product?.pieces_per_unit?.toString() ?? '',
  };
}

export function toProductInput(values: ProductFormOutput): ProductInput {
  return values;
}

const NAME_RULES: Record<LookupKind, { min: number; max: number }> = {
  types: { min: 2, max: 40 },
  brands: { min: 1, max: 60 },
  units: { min: 2, max: 40 },
};

/** Types, brands and units share a form; only the name's length differs. */
export function lookupSchema(kind: LookupKind) {
  const { min, max } = NAME_RULES[kind];
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name.')
      .min(min, `Use at least ${min} characters.`)
      .max(max, `Use at most ${max} characters.`),
    note: z.string().trim().max(120, 'Use at most 120 characters.'),
  });
}

export type LookupForm = z.infer<ReturnType<typeof lookupSchema>>;
export const LOOKUP_FIELDS = ['name', 'note'] as const satisfies readonly (keyof LookupForm)[];

export function lookupDefaults(lookup?: Lookup): LookupForm {
  return { name: lookup?.name ?? '', note: lookup?.note ?? '' };
}

export function toLookupInput(values: LookupForm): LookupInput {
  return { name: values.name, note: values.note === '' ? null : values.note };
}

/** An edit sends both fields; a blank note clears the saved one. */
export function toLookupPatch(values: LookupForm): LookupPatch {
  return { name: values.name, note: values.note };
}
