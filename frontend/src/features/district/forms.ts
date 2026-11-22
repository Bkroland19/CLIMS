import { z } from 'zod';

import { formatNumber } from '@/lib/format';

import type {
  DispatchInput,
  MovementInput,
  ReceiveInput,
  RecordableReason,
  ReplenishmentInput,
} from './api';

/*
 * The DCFP's forms, checked against the API's own rules
 * (`orders/workflow_handler.go` `validActionInput`, `inventory/handler.go`
 * `validate`) so a refusal is caught before it is sent. The server still
 * decides: what is available can change between loading the page and sending.
 */

/** The orders API counts in 32-bit integers. */
const ORDER_MAX = 2_147_483_647;
/** The ledger takes at most a billion either way. */
const MOVEMENT_MAX = 1_000_000_000;
/** The orders API stores up to 4,000 bytes of a note. */
const ORDER_NOTE_BYTES = 4000;
/** The ledger stores up to 1,000 characters of a note. */
const MOVEMENT_NOTE_CHARS = 1000;

/**
 * A whole number typed by a person: digits with optional thousands
 * separators ("1,200" or "1 200"), and a leading minus when `signed`. Null
 * for anything else.
 */
export function parseWholeNumber(text: string, { signed = false } = {}): number | null {
  const compact = text.trim().replaceAll(/[\s,]/g, '').replace(/^[−–]/, '-');
  const pattern = signed ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(compact)) return null;
  const value = Number(compact);
  return Number.isSafeInteger(value) ? value : null;
}

const chooseOne = (message: string) => z.string().min(1, message);

const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/* Send from the district store ------------------------------------------- */

/**
 * The send form. `availableIn(unitId)` is what the district store can send of
 * the product in that unit, or null when it is not known.
 */
export function sendSchema(availableIn: (unitId: string) => number | null) {
  return z
    .object({
      unit_of_measure_id: chooseOne('Choose the unit to send.'),
      quantity: z.string(),
      rider_id: chooseOne('Choose the rider who will deliver it.'),
    })
    .superRefine(({ unit_of_measure_id, quantity }, context) => {
      const available = unit_of_measure_id ? availableIn(unit_of_measure_id) : null;
      const message = sendQuantityError(quantity, available);
      if (message) context.addIssue({ code: 'custom', path: ['quantity'], message });
    });
}

/** What is wrong with a quantity to send, given what is `available` in its unit (null: not known). */
export function sendQuantityError(text: string, available: number | null): string | null {
  const quantity = parseWholeNumber(text);
  if (quantity === null || quantity < 1) return 'Enter a whole number of at least 1.';
  if (quantity > ORDER_MAX) return 'That number is too large.';
  if (available !== null && quantity > available) {
    return `The district store has ${formatNumber(available)} available in this unit. Send less, or ask the warehouse.`;
  }
  return null;
}

export type SendValues = z.input<ReturnType<typeof sendSchema>>;

export function toDispatchInput(values: SendValues): DispatchInput | null {
  const quantity = parseWholeNumber(values.quantity);
  if (quantity === null) return null;
  return {
    rider_id: values.rider_id,
    unit_of_measure_id: values.unit_of_measure_id,
    quantity_issued: quantity,
  };
}

/* Ask the warehouse ------------------------------------------------------ */

export const askSchema = z.object({
  warehouse_store_id: chooseOne('Choose the warehouse to ask.'),
  unit_of_measure_id: chooseOne('Choose the unit to ask for.'),
  quantity: z.string().superRefine((text, context) => {
    const quantity = parseWholeNumber(text);
    if (quantity === null || quantity < 1) {
      context.addIssue({ code: 'custom', message: 'Enter a whole number of at least 1.' });
    } else if (quantity > ORDER_MAX) {
      context.addIssue({ code: 'custom', message: 'That number is too large.' });
    }
  }),
});

export type AskValues = z.input<typeof askSchema>;

export function toReplenishmentInput(values: AskValues): ReplenishmentInput | null {
  const quantity = parseWholeNumber(values.quantity);
  if (quantity === null) return null;
  return {
    warehouse_store_id: values.warehouse_store_id,
    unit_of_measure_id: values.unit_of_measure_id,
    quantity,
  };
}

/* Receive a shipment ----------------------------------------------------- */

/** The receive form for a shipment of `issued`: a note is needed when the count differs. */
export function receiveSchema(issued: number) {
  return z
    .object({ quantity_received: z.string(), discrepancy_note: z.string() })
    .superRefine(({ quantity_received, discrepancy_note }, context) => {
      const quantity = parseWholeNumber(quantity_received);
      if (quantity === null) {
        context.addIssue({
          code: 'custom',
          path: ['quantity_received'],
          message: 'Enter the whole number that arrived, or 0 if nothing did.',
        });
        return;
      }
      if (quantity > ORDER_MAX) {
        context.addIssue({
          code: 'custom',
          path: ['quantity_received'],
          message: 'That number is too large.',
        });
        return;
      }
      const note = discrepancy_note.trim();
      if (quantity !== issued && note === '') {
        context.addIssue({
          code: 'custom',
          path: ['discrepancy_note'],
          message: `${formatNumber(issued)} were sent. Say what happened to the difference.`,
        });
      }
      if (utf8Bytes(note) > ORDER_NOTE_BYTES) {
        context.addIssue({
          code: 'custom',
          path: ['discrepancy_note'],
          message: 'Shorten the note.',
        });
      }
    });
}

export type ReceiveValues = z.input<ReturnType<typeof receiveSchema>>;

export function toReceiveInput(values: ReceiveValues): ReceiveInput | null {
  const quantity = parseWholeNumber(values.quantity_received);
  if (quantity === null) return null;
  const note = values.discrepancy_note.trim();
  return { quantity_received: quantity, discrepancy_note: note === '' ? null : note };
}

/* Record stock ----------------------------------------------------------- */

export const stockSchema = z
  .object({
    reason: z.enum(['receipt', 'adjustment']),
    condom_id: chooseOne('Choose the product.'),
    unit_of_measure_id: chooseOne('Choose the unit.'),
    quantity: z.string(),
    note: z.string(),
  })
  .superRefine(({ reason, quantity: text, note }, context) => {
    const quantity = parseWholeNumber(text, { signed: reason === 'adjustment' });
    const trimmed = note.trim();
    if (reason === 'receipt' && (quantity === null || quantity < 1)) {
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Enter how many arrived: a whole number of at least 1.',
      });
    } else if (reason === 'adjustment' && (quantity === null || quantity === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Enter the change: a whole number, negative to remove stock, for example −4.',
      });
    } else if (quantity !== null && Math.abs(quantity) > MOVEMENT_MAX) {
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'That number is too large.',
      });
    }
    if (reason === 'adjustment' && trimmed === '') {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Say why the stock changed, for example what the count found.',
      });
    }
    if (Array.from(trimmed).length > MOVEMENT_NOTE_CHARS) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Use at most 1,000 characters.',
      });
    }
  });

export type StockValues = z.input<typeof stockSchema>;

export function toMovementInput(storeId: string, values: StockValues): MovementInput | null {
  const reason: RecordableReason = values.reason;
  const quantity = parseWholeNumber(values.quantity, { signed: reason === 'adjustment' });
  if (quantity === null) return null;
  const note = values.note.trim();
  return {
    store_id: storeId,
    condom_id: values.condom_id,
    unit_of_measure_id: values.unit_of_measure_id,
    reason,
    quantity,
    note: note === '' ? null : note,
  };
}
