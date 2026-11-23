import { packLabel, productName, type Product } from '@/features/catalogue/api';
import type { StockBalance, StockBatch } from '@/features/inventory/api';
import { formatNumber } from '@/lib/format';

import { planDispatch, reservable, type DispatchPlan, type PlannedTake } from './picking';
import type { UnitAmount } from './summary';

/*
 * Sending stock to a district store before it orders (docs/modules/orders.md, step 3). Each line
 * is one product in its catalogue unit, the unit the API counts the order in. Only free stock can
 * go: on hand, less what district orders have reserved and less expired batches. The batches leave
 * first expiry first out, as at any dispatch.
 */

/** A product the warehouse can send now, in its catalogue unit. */
export interface Dispatchable {
  product: Product;
  /** "Engabu · Male · Free, box of 144". */
  label: string;
  unitId: string;
  unit: string;
  free: number;
  /** The product's batches in that unit, in the order dispatch takes them. */
  batches: StockBatch[];
}

/**
 * Active products with a catalogue unit and free stock in it at the warehouse, by name. Stock
 * held in another unit cannot be sent this way: the order takes the product's own unit.
 */
export function dispatchables(
  products: readonly Product[],
  balances: readonly StockBalance[],
  batches: readonly StockBatch[],
): Dispatchable[] {
  const out: Dispatchable[] = [];
  for (const product of products) {
    const unit = product.unit;
    if (!product.active || !unit) continue;
    const own = batches.filter(
      (batch) => batch.condom_id === product.id && batch.unit_of_measure_id === unit.id,
    );
    const balance = balances.find(
      (row) => row.condom_id === product.id && row.unit_of_measure_id === unit.id,
    );
    const free = reservable(balance, own);
    if (free <= 0) continue;
    const label = [productName(product), packLabel(product)].filter(Boolean).join(', ');
    out.push({ product, label, unitId: unit.id, unit: unit.name, free, batches: own });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export interface DispatchLine {
  /** Stable across removals, for React and for focusing. */
  key: number;
  productId: string;
  quantity: string;
}

export interface LineCheck {
  quantity: number | null;
  errors: { productId?: string; quantity?: string };
  /** The batches it takes, once the product and a quantity within the free stock are known. */
  plan: DispatchPlan | null;
}

export interface DispatchCheck {
  lines: LineCheck[];
  valid: boolean;
  /** Takes from batches with under one month left, which need an exception reason. */
  nearExpiry: PlannedTake[];
}

/** Whole pieces, or null for anything else. */
function whole(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Each line's problems, mirroring the API, and the batches each valid line takes. */
export function checkDispatch(
  lines: readonly DispatchLine[],
  byId: ReadonlyMap<string, Dispatchable>,
): DispatchCheck {
  const firstLine = new Map<string, number>();
  const checks = lines.map((line, index): LineCheck => {
    const errors: LineCheck['errors'] = {};
    const item = byId.get(line.productId);
    if (!line.productId || !item) {
      errors.productId = 'Choose a product.';
    } else {
      const first = firstLine.get(line.productId);
      if (first === undefined) firstLine.set(line.productId, index);
      else
        errors.productId = `This product is already on line ${String(first + 1)}. Put its whole quantity there.`;
    }
    const quantity = whole(line.quantity);
    if (quantity === null || quantity < 1) {
      errors.quantity = 'Enter how many to dispatch, as a whole number.';
    } else if (item && quantity > item.free) {
      errors.quantity = `Free to dispatch: ${formatNumber(item.free)} ${item.unit}. Enter that or less.`;
    }
    const plan =
      item && quantity !== null && !errors.quantity ? planDispatch(item.batches, quantity) : null;
    return { quantity, errors, plan };
  });
  return {
    lines: checks,
    valid: checks.every((check) => Object.keys(check.errors).length === 0),
    nearExpiry: checks.flatMap((check) =>
      check.errors.productId ? [] : (check.plan?.nearExpiry ?? []),
    ),
  };
}

/** What the lines with a valid quantity add up to, per unit, largest first. */
export function dispatchTotals(
  lines: readonly DispatchLine[],
  checks: readonly LineCheck[],
  byId: ReadonlyMap<string, Dispatchable>,
): UnitAmount[] {
  const byUnit = new Map<string, number>();
  lines.forEach((line, index) => {
    const quantity = checks[index]?.quantity;
    const unit = byId.get(line.productId)?.unit;
    if (quantity && unit) byUnit.set(unit, (byUnit.get(unit) ?? 0) + quantity);
  });
  return [...byUnit.entries()]
    .map(([unit, quantity]) => ({ unit, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}
