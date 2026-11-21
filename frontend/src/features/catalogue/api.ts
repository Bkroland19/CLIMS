import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * The condom catalogue: products, and the brands and units of measure they
 * reference (`backend/internal/features/catalogue`).
 *
 *   GET    /catalogue/products[?active=true|false]  → Product[]
 *   POST   /catalogue/products                      ProductInput → Product
 *   PATCH  /catalogue/products/:id                  ProductPatch → Product
 *   DELETE /catalogue/products/:id                  only when not in use
 *   GET    /catalogue/{brands,units}[?active=…]     → Lookup[]
 *   POST   /catalogue/{brands,units}                LookupInput → Lookup
 *   PATCH  /catalogue/{brands,units}/:id            LookupPatch → Lookup
 *   DELETE /catalogue/{brands,units}/:id            only when not in use
 *
 * Any signed-in user can read; writes need `catalogue:manage`. Failures use
 * the standard envelope: 422 `{ error: { field: message } }`, 409 for a
 * duplicate brand or unit name (also under `error.name`) or for deleting a
 * record that is in use, 404 when the record is gone.
 */

export const CATALOGUE_PERMISSION = 'catalogue:manage';

export const PRODUCT_CATEGORIES = ['male', 'female'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Distribution channels, as in the national condom distribution guidelines. */
export const PRODUCT_TYPES = ['free', 'socially_marketed', 'commercial'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

const count = z.number().int().nonnegative();
const refSchema = z.object({ id: z.string(), name: z.string() });

export type CatalogueRef = z.infer<typeof refSchema>;

const productSchema = z.object({
  id: z.string(),
  // Products converted from the legacy system may lack any of these; see isComplete.
  category: z.enum(PRODUCT_CATEGORIES).nullable(),
  type: z.enum(PRODUCT_TYPES).nullable(),
  brand: refSchema.nullable(),
  unit: refSchema.nullable(),
  /** How many single condoms one unit holds. */
  pieces_per_unit: z.number().int().positive().nullable(),
  /** Inactive products are hidden from pickers and cannot be ordered. */
  active: z.boolean(),
  /** Orders or stock records use it, so it can be deactivated but not deleted. */
  in_use: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Product = z.infer<typeof productSchema>;

const lookupSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  /** Inactive brands and units cannot be newly chosen for a product. */
  active: z.boolean(),
  in_use: z.boolean(),
  /** Products that use it, active or not. */
  product_count: count,
  created_at: z.string(),
  updated_at: z.string(),
});

/** A brand or a unit of measure: both have the same shape and rules. */
export type Lookup = z.infer<typeof lookupSchema>;
export type LookupKind = 'brands' | 'units';

export interface ProductInput {
  category: ProductCategory;
  type: ProductType;
  brand_id: string;
  unit_id: string;
  pieces_per_unit: number;
}

/** Any subset of a product's fields, and whether it is active. */
export type ProductPatch = Partial<ProductInput> & { active?: boolean };

export interface LookupInput {
  name: string;
  note: string | null;
}

/** An empty `note` clears it. */
export interface LookupPatch {
  name?: string;
  note?: string;
  active?: boolean;
}

const productPath = (id: string) => `/catalogue/products/${encodeURIComponent(id)}`;
const lookupPath = (kind: LookupKind, id: string) => `/catalogue/${kind}/${encodeURIComponent(id)}`;

export async function listProducts(http: HttpClient, signal?: AbortSignal): Promise<Product[]> {
  return parseList(productSchema, await http.get('/catalogue/products', { signal }), 'products');
}

export async function createProduct(http: HttpClient, input: ProductInput): Promise<Product> {
  return parseBody(productSchema, await http.post('/catalogue/products', input), 'product');
}

export async function updateProduct(
  http: HttpClient,
  id: string,
  patch: ProductPatch,
): Promise<Product> {
  return parseBody(productSchema, await http.patch(productPath(id), patch), 'product');
}

export async function deleteProduct(http: HttpClient, id: string): Promise<void> {
  await http.delete(productPath(id));
}

export async function listLookups(
  http: HttpClient,
  kind: LookupKind,
  signal?: AbortSignal,
): Promise<Lookup[]> {
  return parseList(lookupSchema, await http.get(`/catalogue/${kind}`, { signal }), kind);
}

export async function createLookup(
  http: HttpClient,
  kind: LookupKind,
  input: LookupInput,
): Promise<Lookup> {
  return parseBody(lookupSchema, await http.post(`/catalogue/${kind}`, input), kind);
}

export async function updateLookup(
  http: HttpClient,
  kind: LookupKind,
  id: string,
  patch: LookupPatch,
): Promise<Lookup> {
  return parseBody(lookupSchema, await http.patch(lookupPath(kind, id), patch), kind);
}

export async function deleteLookup(http: HttpClient, kind: LookupKind, id: string): Promise<void> {
  await http.delete(lookupPath(kind, id));
}

const CATEGORY_LABELS: Record<ProductCategory, string> = { male: 'Male', female: 'Female' };
const TYPE_LABELS: Record<ProductType, string> = {
  free: 'Free (public sector)',
  socially_marketed: 'Socially marketed',
  commercial: 'Commercial',
};

export function categoryLabel(category: ProductCategory): string {
  return CATEGORY_LABELS[category];
}

export function typeLabel(type: ProductType): string {
  return TYPE_LABELS[type];
}

/** "Engabu · Male · Free (public sector)", leaving out what a legacy product lacks. */
export function productName(product: Pick<Product, 'brand' | 'category' | 'type'>): string {
  const parts = [
    product.brand?.name,
    product.category ? categoryLabel(product.category) : null,
    product.type ? typeLabel(product.type) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : 'Unnamed product';
}

/** "Box of 144", or what is known of it. */
export function packLabel(product: Pick<Product, 'unit' | 'pieces_per_unit'>): string | null {
  if (product.unit && product.pieces_per_unit !== null) {
    return `${product.unit.name} of ${product.pieces_per_unit.toLocaleString('en-GB')}`;
  }
  return product.unit?.name ?? null;
}

/**
 * Whether every field is set. Products converted from the legacy system may
 * not be; they must be completed before they are edited or reactivated.
 */
export function isComplete(product: Product): boolean {
  return (
    product.category !== null &&
    product.type !== null &&
    product.brand !== null &&
    product.unit !== null &&
    product.pieces_per_unit !== null
  );
}
