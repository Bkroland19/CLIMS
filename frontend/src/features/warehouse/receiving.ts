import { isCalendarDate } from '@/lib/validation';

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
  if (!fields.productId) errors.productId = 'Choose the product.';
  if (!fields.unitId) errors.unitId = 'Choose the unit it was counted in.';
  const number = fields.batchNumber.trim();
  if (!number) errors.batchNumber = 'Enter the batch number on the packaging.';
  else if (number.length > 60) errors.batchNumber = 'Batch numbers are at most 60 characters.';
  if (!isCalendarDate(fields.expiryDate)) {
    errors.expiryDate = 'Enter the expiry date printed on the packaging.';
  } else if (fields.expiryDate <= today) {
    errors.expiryDate = 'This batch has expired. Expired stock cannot be registered for issue.';
  }
  const trimmed = fields.quantity.trim();
  const quantity = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (quantity === null || quantity < 1 || !Number.isSafeInteger(quantity)) {
    errors.quantity = 'Enter how many, as a whole number.';
  } else if (quantity > 1_000_000_000) {
    errors.quantity = 'Enter at most 1,000,000,000 units per batch.';
  }
  const shortShelf = !errors.expiryDate && fields.expiryDate < addMonths(today, SHORT_SHELF_MONTHS);
  return { errors, quantity: errors.quantity ? null : quantity, shortShelf };
}

export interface ReceiptCheck {
  /** Each line's checks, in order. */
  lines: ReturnType<typeof checkDelivery>[];
  /** True when every line can be sent. */
  valid: boolean;
}

/**
 * Checks every batch of a delivery. The same batch may come on two lines (two pallets of it), but
 * not with two expiry dates: the second line says which line disagrees.
 */
export function checkReceipt(lines: readonly DeliveryFields[], today: string): ReceiptCheck {
  const checks = lines.map((line) => checkDelivery(line, today));
  const first = new Map<string, number>();
  lines.forEach((line, index) => {
    const number = line.batchNumber.trim();
    if (!number || !line.productId || !line.unitId) return;
    const key = `${line.productId}|${line.unitId}|${number}`;
    const earlier = first.get(key);
    if (earlier === undefined) {
      first.set(key, index);
      return;
    }
    const check = checks[index];
    if (check && !check.errors.expiryDate && lines[earlier]?.expiryDate !== line.expiryDate) {
      check.errors.expiryDate = `Batch ${number} is on line ${String(earlier + 1)} with another expiry date.`;
    }
  });
  return {
    lines: checks,
    valid: checks.every((check) => Object.keys(check.errors).length === 0),
  };
}

/** The API's words for a refused line, where they name fields rather than say what to do. */
const LINE_MESSAGES: Record<string, string> = {
  'store_id, condom_id or unit_of_measure_id does not exist':
    'This product or unit is no longer in the catalogue. Choose it again.',
  'batch_number and expiry_date are required': 'Enter the batch number and expiry date.',
};

/** "line 2: the message" from the API, as the line's index and the message without its prefix. */
export function lineOfError(message: string): { index: number; message: string } | null {
  const match = /^line (\d+): (.+)$/s.exec(message);
  if (!match) return null;
  const text = match[2] ?? '';
  return {
    index: Number(match[1]) - 1,
    message: LINE_MESSAGES[text] ?? text.charAt(0).toUpperCase() + text.slice(1),
  };
}

/** Today's date in Uganda (UTC+3, no daylight saving), YYYY-MM-DD. */
export function ugandaToday(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
