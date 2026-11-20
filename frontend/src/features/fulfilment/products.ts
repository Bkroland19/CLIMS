import { formatNumber } from '@/lib/format';

/** The products a hotspot order or warehouse request is counted in. */
export type ProductKey = 'male' | 'female';

/** A number of pieces of each product. */
export type Quantities = Readonly<Record<ProductKey, number>>;

export interface Product {
  key: ProductKey;
  name: string;
  brand: string;
  /** The word used in a one-line summary, e.g. "Male 1,500 · Female 60". */
  short: string;
}

/**
 * The two condom products orders are placed in. The prototype fixes these;
 * once the product catalogue API exists (Phase 7) the names and brands come
 * from it, and orders keep using the key.
 */
export const PRODUCTS: readonly [Product, Product] = [
  { key: 'male', name: 'Male condoms', brand: 'Engabu', short: 'Male' },
  { key: 'female', name: 'Female condoms', brand: 'FC2', short: 'Female' },
];

export const NO_QUANTITIES: Quantities = { male: 0, female: 0 };

export function productOf(key: ProductKey): Product {
  return key === 'male' ? PRODUCTS[0] : PRODUCTS[1];
}

/** "Male 1,500 · Female 60", leaving out products with none; "—" for nothing at all. */
export function formatQuantities(quantities: Quantities | null | undefined): string {
  if (!quantities) return '—';
  const parts = PRODUCTS.filter((product) => quantities[product.key] > 0).map(
    (product) => `${product.short} ${formatNumber(quantities[product.key])}`,
  );
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function totalPieces(quantities: Quantities): number {
  return quantities.male + quantities.female;
}

/** Adds up several sets of quantities. */
export function sumQuantities(all: readonly Quantities[]): Quantities {
  return all.reduce<Quantities>(
    (total, next) => ({ male: total.male + next.male, female: total.female + next.female }),
    NO_QUANTITIES,
  );
}

/** Whether `stock` covers `needed` for every product. */
export function covers(stock: Quantities, needed: Quantities): boolean {
  return PRODUCTS.every((product) => needed[product.key] <= stock[product.key]);
}

/**
 * A typed-in number of pieces: a whole number, zero or more, with or without
 * thousands separators. Null when the text is not one.
 */
export function parsePieces(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}
