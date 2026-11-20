import { parsePieces, PRODUCTS, type ProductKey } from '@/features/fulfilment/products';
import { formatNumber } from '@/lib/format';

import type { CheckId, FigureKey, Figures, MonthlyReport, ReportInput, ReportLevel } from './api';
import { daysInPeriod, monthName } from './status';

/*
 * The figures on a monthly report and the checks they must pass before the
 * report is sent. The server runs the same checks again; these are here so
 * the reporter finds out while still on the page.
 *
 * Stock balances when opening + received − issued − losses = closing, for
 * each product.
 */

export interface FigureRow {
  key: FigureKey;
  label: string;
  hint: string;
}

export interface ReportForm {
  /** e.g. "District stock report". */
  name: string;
  rows: readonly FigureRow[];
  /** The days-out-of-stock question and its label, for levels that are asked it. */
  daysOut: { label: string; hint?: string } | null;
  /** Heading for the questions after the stock table. */
  otherTitle: string;
}

const OPENING: FigureRow = {
  key: 'opening',
  label: 'Opening balance',
  hint: "Last month's closing balance",
};
const LOSSES: FigureRow = {
  key: 'losses',
  label: 'Losses & adjustments',
  hint: 'Expired, damaged or missing',
};

/** Each level's report, as the prototype words it. */
export const REPORT_FORMS: Record<ReportLevel, ReportForm> = {
  district: {
    name: 'District stock report',
    rows: [
      OPENING,
      {
        key: 'received',
        label: 'Received from warehouses',
        hint: 'NMS and JMS consignments received in CLIMS',
      },
      { key: 'issued', label: 'Issued to hotspots', hint: 'Orders confirmed in CLIMS' },
      LOSSES,
      { key: 'closing', label: 'Closing balance', hint: 'Physical count of the district store' },
    ],
    daysOut: { label: 'Days the store was out of stock' },
    otherTitle: 'District store',
  },
  warehouse: {
    name: 'Warehouse stock report',
    rows: [
      OPENING,
      { key: 'received', label: 'Received from suppliers', hint: 'Supplier deliveries this month' },
      { key: 'issued', label: 'Issued to districts', hint: 'Dispatches recorded in CLIMS' },
      LOSSES,
      { key: 'closing', label: 'Closing balance', hint: 'Physical count at month end' },
      { key: 'expiring', label: 'Expiring within 6 months', hint: 'Part of the closing balance' },
    ],
    daysOut: null,
    otherTitle: 'Other details',
  },
  hotspot: {
    name: 'Hotspot monthly report',
    rows: [
      OPENING,
      { key: 'received', label: 'Received', hint: 'Deliveries confirmed in CLIMS' },
      {
        key: 'issued',
        label: 'Distributed to clients',
        hint: 'Taken from the dispenser or handed out',
      },
      LOSSES,
      { key: 'closing', label: 'Closing balance', hint: 'Physical count at month end' },
    ],
    daysOut: { label: 'Days out of stock', hint: 'Days with nothing in the dispenser' },
    otherTitle: 'Service at the hotspot',
  },
  vht: {
    name: 'VHT outreach report',
    rows: [
      OPENING,
      { key: 'received', label: 'Received', hint: 'Issued to you in CLIMS' },
      {
        key: 'issued',
        label: 'Distributed during outreach',
        hint: 'Handed out at hotspots and in the community',
      },
      LOSSES,
      { key: 'closing', label: 'Closing balance', hint: 'Condoms you hold at month end' },
    ],
    daysOut: null,
    otherTitle: 'Outreach',
  },
};

export const LOSS_REASONS = [
  'Expired',
  'Damaged',
  'Stolen or missing',
  'Count correction',
  'Other',
] as const;

export const CHECKS: readonly { id: CheckId; label: string }[] = [
  { id: 'required', label: 'Required fields complete' },
  { id: 'whole', label: 'Whole numbers, none negative' },
  { id: 'balance', label: 'Stock balances for each product' },
  { id: 'range', label: 'Values within range' },
];

/** What the reporter has typed, kept as text so a half-typed number is not lost. */
export interface ReportDraft {
  figures: Record<ProductKey, Record<FigureKey, string>>;
  daysOut: string;
  lossReason: string;
  comment: string;
}

/** A field on the report: `male.closing`, `days_out_of_stock`, `loss_reason`. */
export type ReportField = `${ProductKey}.${FigureKey}` | 'days_out_of_stock' | 'loss_reason';

export interface ReportProblem {
  field: ReportField;
  check: CheckId;
  /** Where the problem is, e.g. "Male · Closing balance". */
  where: string;
  message: string;
}

/** The id of a field's input, so a problem can link to it. */
export function fieldId(field: string): string {
  return `report-${field.replace(/[^a-z0-9]+/gi, '-')}`;
}

const text = (value: number | null) => (value === null ? '' : String(value));

function figureText(figures: Figures): Record<FigureKey, string> {
  return {
    opening: text(figures.opening),
    received: text(figures.received),
    issued: text(figures.issued),
    losses: text(figures.losses),
    closing: text(figures.closing),
    expiring: text(figures.expiring),
  };
}

/** The report's saved values, as text for the form. */
export function draftFrom(report: MonthlyReport): ReportDraft {
  return {
    figures: { male: figureText(report.figures.male), female: figureText(report.figures.female) },
    daysOut: text(report.days_out_of_stock),
    lossReason: report.loss_reason ?? '',
    comment: report.comment ?? '',
  };
}

const parseOrNull = (value: string): number | null => parsePieces(value);

function figuresFrom(values: Record<FigureKey, string>): Figures {
  return {
    opening: parseOrNull(values.opening),
    received: parseOrNull(values.received),
    issued: parseOrNull(values.issued),
    losses: parseOrNull(values.losses),
    closing: parseOrNull(values.closing),
    expiring: parseOrNull(values.expiring),
  };
}

/**
 * The body for saving or sending. A figure that is not a whole number goes as
 * null: a draft may be incomplete, and a report is only sent once every
 * figure has passed {@link checkReport}.
 */
export function inputFrom(draft: ReportDraft, level: ReportLevel): ReportInput {
  const asksDaysOut = REPORT_FORMS[level].daysOut !== null;
  const comment = draft.comment.trim();
  const reason = draft.lossReason.trim();
  return {
    figures: { male: figuresFrom(draft.figures.male), female: figuresFrom(draft.figures.female) },
    days_out_of_stock: asksDaysOut ? parseOrNull(draft.daysOut) : null,
    loss_reason: reason === '' || !anyLosses(draft) ? null : reason,
    comment: comment === '' ? null : comment,
  };
}

/** Whether any product records losses, which makes the reason required. */
export function anyLosses(draft: ReportDraft): boolean {
  return PRODUCTS.some((product) => (parsePieces(draft.figures[product.key].losses) ?? 0) > 0);
}

/**
 * What the closing balance should be from the other figures, or null while
 * one of them is not a whole number yet.
 */
export function expectedClosing(values: Record<FigureKey, string>): number | null {
  const opening = parsePieces(values.opening);
  const received = parsePieces(values.received);
  const issued = parsePieces(values.issued);
  const losses = parsePieces(values.losses);
  if (opening === null || received === null || issued === null || losses === null) return null;
  return opening + received - issued - losses;
}

interface CheckTarget {
  level: ReportLevel;
  period: string;
  /** Rows CLIMS filled in; they are not the reporter's to fix. */
  prefilled: readonly FigureKey[];
}

/**
 * Every problem with the report as typed, in the order the fields appear.
 * An empty list means it can be sent.
 */
export function checkReport(target: CheckTarget, draft: ReportDraft): ReportProblem[] {
  const form = REPORT_FORMS[target.level];
  const problems: ReportProblem[] = [];
  const rowLabel = (key: FigureKey) => form.rows.find((row) => row.key === key)?.label ?? key;
  const hasRow = (key: FigureKey) => form.rows.some((row) => row.key === key);

  for (const product of PRODUCTS) {
    const values = draft.figures[product.key];
    const at = (key: FigureKey) => ({
      field: `${product.key}.${key}` as const,
      where: `${product.short} · ${rowLabel(key)}`,
    });
    let incomplete = false;

    for (const row of form.rows) {
      if (target.prefilled.includes(row.key)) continue;
      const value = values[row.key].trim();
      if (value === '') {
        problems.push({ ...at(row.key), check: 'required', message: 'Required. Enter 0 if none.' });
        incomplete = true;
      } else if (parsePieces(value) === null) {
        problems.push({
          ...at(row.key),
          check: 'whole',
          message: 'Enter a whole number of pieces, 0 or more.',
        });
        incomplete = true;
      }
    }
    if (incomplete) continue;

    const figure = (key: FigureKey) => parsePieces(values[key]) ?? 0;
    const had = figure('opening') + figure('received');
    const out = figure('issued') + figure('losses');
    if (out > had) {
      const key: FigureKey = target.prefilled.includes('issued') ? 'losses' : 'issued';
      problems.push({
        ...at(key),
        check: 'balance',
        message: `Issued plus losses (${formatNumber(out)}) is more than you had (${formatNumber(had)}).`,
      });
    } else if (figure('closing') !== had - out) {
      problems.push({
        ...at('closing'),
        check: 'balance',
        message: `Doesn't balance: opening + received − issued − losses = ${formatNumber(had - out)}. Recount, or record the difference as a loss or adjustment.`,
      });
    }
    if (hasRow('expiring') && figure('expiring') > figure('closing')) {
      problems.push({
        ...at('expiring'),
        check: 'range',
        message: `Can't be more than the closing balance (${formatNumber(figure('closing'))}).`,
      });
    }
  }

  if (form.daysOut) {
    const value = draft.daysOut.trim();
    const where = form.daysOut.label;
    const days = daysInPeriod(target.period);
    const parsed = parsePieces(value);
    if (value === '') {
      problems.push({
        field: 'days_out_of_stock',
        where,
        check: 'required',
        message: 'Required. Enter 0 if none.',
      });
    } else if (parsed === null) {
      problems.push({
        field: 'days_out_of_stock',
        where,
        check: 'whole',
        message: 'Enter a whole number, 0 or more.',
      });
    } else if (parsed > days) {
      problems.push({
        field: 'days_out_of_stock',
        where,
        check: 'range',
        message: `${monthName(target.period)} has ${days} days. Enter 0–${days}.`,
      });
    }
  }

  if (anyLosses(draft) && draft.lossReason.trim() === '') {
    problems.push({
      field: 'loss_reason',
      where: 'Reason for losses',
      check: 'required',
      message: 'Say why stock was lost or adjusted.',
    });
  }

  return problems;
}
