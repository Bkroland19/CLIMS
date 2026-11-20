import type { Figures, MonthlyReport } from '@/features/reports/api';

/*
 * Monthly reports as the API sends them, for tests. Each builder gives a
 * plausible record; pass only the fields a test is about.
 */

export function figures(values: Partial<Figures> = {}): Figures {
  return {
    opening: null,
    received: null,
    issued: null,
    losses: null,
    closing: null,
    expiring: null,
    ...values,
  };
}

/** Wakiso's October district report: CLIMS rows filled in, the rest still to enter. */
export function aReport(overrides: Partial<MonthlyReport> = {}): MonthlyReport {
  return {
    id: 'RPT-2610-WAKISO',
    period: '2026-10',
    due_on: '2026-11-20',
    level: 'district',
    unit: { id: 'WAKISO', name: 'Wakiso district store', district: 'Wakiso' },
    reporter: 'Sarah Namubiru',
    status: 'draft',
    figures: {
      male: figures({ opening: 8200, received: 6000, issued: 11600 }),
      female: figures({ opening: 300, received: 200, issued: 360 }),
    },
    prefilled: ['opening', 'received', 'issued'],
    days_out_of_stock: null,
    loss_reason: null,
    extras: [],
    comment: null,
    errors: [],
    validation_runs: 0,
    saved_at: null,
    submitted_at: null,
    receipt: null,
    reviewed_at: null,
    reviewed_by: null,
    history: [],
    ...overrides,
  };
}

/** The same report once sent, figures balanced. */
export function aSentReport(overrides: Partial<MonthlyReport> = {}): MonthlyReport {
  return aReport({
    status: 'submitted',
    figures: {
      male: figures({ opening: 8200, received: 6000, issued: 11600, losses: 0, closing: 2600 }),
      female: figures({ opening: 300, received: 200, issued: 360, losses: 0, closing: 140 }),
    },
    days_out_of_stock: 0,
    validation_runs: 1,
    saved_at: '2026-11-18T09:00:00Z',
    submitted_at: '2026-11-18T09:00:00Z',
    receipt: 'SRV-2610-4820',
    ...overrides,
  });
}
