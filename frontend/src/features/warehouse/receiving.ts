/*
 * A delivery into a warehouse, batch by batch (docs/modules/inventory.md#batches-and-expiry). Each
 * batch is recorded as a receipt into the batch it names; stock leaves first expiry first out, so
 * the batch number and expiry date matter as much as the quantity.
 */

export interface DeliveryFields {
  productId: string;
  unitId: string;
  batchNumber: string;
  /** YYYY-MM-DD from the date input. */
  expiryDate: string;
  quantity: string;
}

export type DeliveryErrors = Partial<Record<keyof DeliveryFields, string>>;

/** Six months, as the reporting rules count shelf life: less is accepted, with a warning. */
const SHORT_SHELF_MONTHS = 6;

function addMonths(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + months, day));
  return moved.toISOString().slice(0, 10);
}

/**
 * What is wrong with a delivery batch, by field, and a warning when it arrives with under six
 * months of shelf life. `today` is Uganda's date, YYYY-MM-DD.
 */
export function checkDelivery(
  fields: DeliveryFields,
  today: string,
): { errors: DeliveryErrors; quantity: number | null; shortShelf: boolean } {
  const errors: DeliveryErrors = {};
  if (!fields.productId) errors.productId = 'Choose the product delivered.';
  if (!fields.unitId) errors.unitId = 'Choose the unit it was counted in.';
  const number = fields.batchNumber.trim();
  if (!number) errors.batchNumber = 'Enter the batch number on the carton.';
  else if (number.length > 60) errors.batchNumber = 'Batch numbers are at most 60 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.expiryDate)) {
    errors.expiryDate = 'Enter the expiry date printed on the carton.';
  } else if (fields.expiryDate <= today) {
    errors.expiryDate = 'This batch has expired. Expired stock cannot be received for issue.';
  }
  const trimmed = fields.quantity.trim();
  const quantity = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (quantity === null || quantity < 1 || !Number.isSafeInteger(quantity)) {
    errors.quantity = 'Enter how many arrived, as a whole number.';
  }
  const shortShelf = !errors.expiryDate && fields.expiryDate < addMonths(today, SHORT_SHELF_MONTHS);
  return { errors, quantity: errors.quantity ? null : quantity, shortShelf };
}

/** Today's date in Uganda (UTC+3, no daylight saving), YYYY-MM-DD. */
export function ugandaToday(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
