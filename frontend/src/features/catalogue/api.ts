import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The product catalogue: condom products and the units they are counted in.
 *
 * NOT YET IN THE GO API. These paths and shapes are the contract the web
 * client is written against and the mock API (`dev/mock/admin.mts`) serves;
 * Phase 7 of `design/IMPLEMENTATION_PLAN.md` lists them for the backend.
 * The catalogue screens show a sample-data notice until they exist.
 *
 *   GET   /catalogue/products        → Product[]
 *   POST  /catalogue/products        NewProductInput → Product
 *   PATCH /catalogue/products/:id    { active } → Product
 *   GET   /catalogue/units           → Unit[]
 *   POST  /catalogue/units           NewUnitInput → Unit
 *
 * Validation failures answer 422 `{ success: false, message, error: { field: message } }`
 * and a duplicate unit name 409 with the same shape, as the Go API does.
 */

export const PRODUCT_CATEGORIES = ['male', 'female'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

const count = z.number().int().nonnegative();

const productSchema = z.object({
  /** A stock-keeping code, e.g. `CND-001`. */
  id: z.string(),
  category: z.enum(PRODUCT_CATEGORIES),
  brand: z.string(),
  type: z.string(),
  unit: z.object({ id: z.string(), name: z.string() }),
  /** How many single condoms one unit holds. */
  pieces_per_unit: z.number().int().positive(),
  /** Pieces below which a store is flagged below minimum; null when not set. */
  minimum_level: count.nullable(),
  active: z.boolean(),
});

export type Product = z.infer<typeof productSchema>;

const unitSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  /** How many products are counted in this unit. */
  product_count: count,
});

export type Unit = z.infer<typeof unitSchema>;

export interface NewProductInput {
  category: ProductCategory;
  brand: string;
  type: string;
  unit_id: string;
  pieces_per_unit: number;
  minimum_level: number | null;
}

export interface NewUnitInput {
  name: string;
  note: string | null;
}

export async function listProducts(http: HttpClient, signal?: AbortSignal): Promise<Product[]> {
  return parseList(productSchema, await http.get('/catalogue/products', { signal }), 'products');
}

export async function createProduct(http: HttpClient, input: NewProductInput): Promise<Product> {
  return parseBody(productSchema, await http.post('/catalogue/products', input), 'product');
}

export async function setProductActive(
  http: HttpClient,
  id: string,
  active: boolean,
): Promise<Product> {
  return parseBody(
    productSchema,
    await http.patch(`/catalogue/products/${encodeURIComponent(id)}`, { active }),
    'product',
  );
}

export async function listUnits(http: HttpClient, signal?: AbortSignal): Promise<Unit[]> {
  return parseList(unitSchema, await http.get('/catalogue/units', { signal }), 'units');
}

export async function createUnit(http: HttpClient, input: NewUnitInput): Promise<Unit> {
  return parseBody(unitSchema, await http.post('/catalogue/units', input), 'unit');
}

const CATEGORY_LABELS: Record<ProductCategory, string> = { male: 'Male', female: 'Female' };

export function categoryLabel(category: ProductCategory): string {
  return CATEGORY_LABELS[category];
}

/** "Engabu · Standard". */
export function productName(product: Pick<Product, 'brand' | 'type'>): string {
  return `${product.brand} · ${product.type}`;
}
