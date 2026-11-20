import { z } from 'zod';

import { wholeNumber } from '@/lib/validation';

import { PRODUCT_CATEGORIES, type NewProductInput, type NewUnitInput } from './api';

/*
 * The rules the mock catalogue API enforces (see `dev/mock/admin.mts`); the
 * Go API should enforce the same when it gains these endpoints.
 */

export const productSchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES, 'Choose a category.'),
  brand: z
    .string()
    .trim()
    .min(1, 'Enter the brand, e.g. Engabu.')
    .max(60, 'Use at most 60 characters.'),
  type: z
    .string()
    .trim()
    .min(1, 'Enter the type, e.g. Standard.')
    .max(60, 'Use at most 60 characters.'),
  unit_id: z.string().min(1, 'Choose a unit of measure.'),
  pieces_per_unit: wholeNumber('how many condoms one unit holds', { min: 1, max: 100_000 }),
  // Optional: blank means no minimum is set.
  minimum_level: z
    .string()
    .trim()
    .regex(/^\d*$/, 'Use a whole number, with no decimals or symbols.')
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number().max(10_000_000, 'Must be at most 10,000,000.').nullable()),
});

export type ProductFormInput = z.input<typeof productSchema>;
export type ProductFormOutput = z.output<typeof productSchema>;

export const PRODUCT_FIELDS = [
  'category',
  'brand',
  'type',
  'unit_id',
  'pieces_per_unit',
  'minimum_level',
] as const satisfies readonly (keyof ProductFormInput)[];

export const PRODUCT_DEFAULTS: ProductFormInput = {
  category: 'male',
  brand: '',
  type: '',
  unit_id: '',
  pieces_per_unit: '1',
  minimum_level: '',
};

export function toNewProductInput(values: ProductFormOutput): NewProductInput {
  return values;
}

export const unitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters.')
    .max(40, 'Use at most 40 characters.'),
  note: z.string().trim().max(120, 'Use at most 120 characters.'),
});

export type UnitForm = z.infer<typeof unitSchema>;
export const UNIT_FIELDS = ['name', 'note'] as const satisfies readonly (keyof UnitForm)[];

export function toNewUnitInput(values: UnitForm): NewUnitInput {
  return { name: values.name, note: values.note === '' ? null : values.note };
}
