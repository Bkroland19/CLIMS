/**
 * The outcome of checking one product's free stock against what an order or
 * request needs. Used by the DCFP order review (district store) and the
 * warehouse request review (NMS / JMS).
 */
export type StockCheck =
  { status: 'not-needed' } | { status: 'available' } | { status: 'short'; shortBy: number };

/**
 * Compares the quantity needed with the quantity free to issue, both in
 * pieces. Nothing needed (zero, negative or not a number) is `not-needed`;
 * free stock that is not a number counts as none.
 */
export function checkStock(needed: number, available: number): StockCheck {
  if (!Number.isFinite(needed) || needed <= 0) return { status: 'not-needed' };
  const free = Number.isFinite(available) ? Math.max(0, available) : 0;
  return free >= needed ? { status: 'available' } : { status: 'short', shortBy: needed - free };
}
