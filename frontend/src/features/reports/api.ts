import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * Monthly stock reports: each reporting unit (hotspot, VHT, district store,
 * national warehouse) sends one a month to MOH, and MOH reads them.
 *
 * NOT YET IN THE GO API. These paths and shapes are the contract the web
 * client is written against and the mock API (`dev/mock/reports.mts`) serves;
 * Phase 8 of `design/IMPLEMENTATION_PLAN.md` lists them for the backend. Every
 * screen that reads them shows a sample-data notice until the real endpoints
 * exist.
 *
 * The server creates a draft for each unit when a month closes, with the rows
 * it can work out from CLIMS records (opening balance, stock received and
 * issued) already filled in and listed in `prefilled`. The reporter enters the
 * rest. Submitting re-checks every figure on the server: a report that fails
 * comes back as a 422 with one message per field, and its status becomes
 * `errors`.
 */

const count = z.number().int().nonnegative();
const timestamp = z.string();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A reporting month, `YYYY-MM`. */
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const REPORT_LEVELS = ['hotspot', 'vht', 'district', 'warehouse'] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

/** The levels that send their report from the web; hotspots and VHTs use the mobile app. */
export type ReporterLevel = Extract<ReportLevel, 'district' | 'warehouse'>;

export const REPORT_STATUSES = ['draft', 'errors', 'submitted'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The stock movement rows, in the order they are added up. */
export const FIGURE_KEYS = [
  'opening',
  'received',
  'issued',
  'losses',
  'closing',
  'expiring',
] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];

export const CHECK_IDS = ['required', 'whole', 'balance', 'range'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** A figure in pieces, or null while it has not been entered. */
const figure = count.nullable();

const figuresSchema = z.object({
  opening: figure,
  received: figure,
  issued: figure,
  losses: figure,
  closing: figure,
  /** Warehouses only: the part of the closing balance that expires within six months. */
  expiring: figure,
});

export type Figures = z.infer<typeof figuresSchema>;

const historySchema = z.object({
  id: z.string(),
  at: timestamp,
  actor: z.string(),
  role: z.enum(['hotspot_manager', 'vht', 'dcfp', 'warehouse', 'rider', 'moh', 'system']),
  role_label: z.string(),
  text: z.string(),
  reference: z.string().nullable(),
});

const reportSchema = z.object({
  /** e.g. `RPT-2610-WAKISO`. */
  id: z.string(),
  period: periodSchema,
  due_on: day,
  level: z.enum(REPORT_LEVELS),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    /** Null for a national warehouse. */
    district: z.string().nullable(),
  }),
  reporter: z.string(),
  status: z.enum(REPORT_STATUSES),
  figures: z.object({ male: figuresSchema, female: figuresSchema }),
  /** The rows CLIMS filled in from its own records. They cannot be edited. */
  prefilled: z.array(z.enum(FIGURE_KEYS)),
  /** Hotspots and district stores only. */
  days_out_of_stock: count.nullable(),
  loss_reason: z.string().nullable(),
  /** Answers only the mobile app asks for (dispenser condition, people reached), read-only here. */
  extras: z.array(z.object({ label: z.string(), value: z.string() })),
  comment: z.string().nullable(),
  /** What the server's check found on the last rejected submission. Empty once sent. */
  errors: z.array(z.object({ field: z.string(), check: z.enum(CHECK_IDS), message: z.string() })),
  /** How many times the report was submitted for checking, including rejected attempts. */
  validation_runs: count,
  saved_at: timestamp.nullable(),
  submitted_at: timestamp.nullable(),
  /** The MOH server's receipt number, once sent. */
  receipt: z.string().nullable(),
  reviewed_at: timestamp.nullable(),
  reviewed_by: z.string().nullable(),
  /** Entry, checking and sending, oldest first. */
  history: z.array(historySchema),
});

export type MonthlyReport = z.infer<typeof reportSchema>;
export type ReportHistoryEvent = MonthlyReport['history'][number];

const coverageSchema = z.object({
  level: z.enum(REPORT_LEVELS),
  /** Units expected to report for the month. */
  expected: count,
  submitted: count,
});

export type ReportCoverage = z.infer<typeof coverageSchema>;

const periodInfoSchema = z.object({ period: periodSchema, due_on: day });

export type ReportPeriod = z.infer<typeof periodInfoSchema>;

/* Reads. */

export interface OwnReportsScope {
  level: ReporterLevel;
  /** For a warehouse user: which national warehouse, e.g. `NMS`. */
  store?: string;
}

/** The signed-in reporter's own reports, every month, newest first. */
export async function listOwnReports(
  http: HttpClient,
  { level, store }: OwnReportsScope,
  signal?: AbortSignal,
): Promise<MonthlyReport[]> {
  const query = new URLSearchParams({ level });
  if (store) query.set('store', store);
  const body = await http.get(`/monthly-reports/own?${query.toString()}`, { signal });
  return parseList(reportSchema, body, 'monthly reports');
}

/** Every unit's report for one month, sent or not (MOH). */
export async function listReports(
  http: HttpClient,
  period: string,
  signal?: AbortSignal,
): Promise<MonthlyReport[]> {
  const query = new URLSearchParams({ period });
  const body = await http.get(`/monthly-reports?${query.toString()}`, { signal });
  return parseList(reportSchema, body, 'monthly reports');
}

/** The months there are reports for, newest first. */
export async function listPeriods(http: HttpClient, signal?: AbortSignal): Promise<ReportPeriod[]> {
  const body = await http.get('/monthly-reports/periods', { signal });
  return parseList(periodInfoSchema, body, 'reporting periods');
}

/** How many units of each level have sent the month's report (MOH). */
export async function listCoverage(
  http: HttpClient,
  period: string,
  signal?: AbortSignal,
): Promise<ReportCoverage[]> {
  const query = new URLSearchParams({ period });
  const body = await http.get(`/monthly-reports/coverage?${query.toString()}`, { signal });
  return parseList(coverageSchema, body, 'report coverage');
}

export async function getReport(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<MonthlyReport> {
  const body = await http.get(`/monthly-reports/${encodeURIComponent(id)}`, { signal });
  return parseBody(reportSchema, body, 'monthly report');
}

/* Writes. */

/** What the reporter entered. Prefilled rows are sent back as they came; the server keeps its own. */
export interface ReportInput {
  figures: { male: Figures; female: Figures };
  days_out_of_stock: number | null;
  loss_reason: string | null;
  comment: string | null;
}

const reportPath = (id: string, action?: string) =>
  `/monthly-reports/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

/** Saves a draft. Blank figures are allowed. */
export async function saveReport(
  http: HttpClient,
  id: string,
  input: ReportInput,
): Promise<MonthlyReport> {
  return parseBody(reportSchema, await http.put(reportPath(id), input), 'monthly report');
}

/**
 * Sends the report to MOH. The server checks it again first; a report that
 * fails is rejected with a 422 whose `error` names each field
 * (`male.closing`, `days_out_of_stock`, …).
 */
export async function submitReport(
  http: HttpClient,
  id: string,
  input: ReportInput,
): Promise<MonthlyReport> {
  const body = await http.post(reportPath(id, 'submit'), input);
  return parseBody(reportSchema, body, 'monthly report');
}

/** Records that MOH has opened a sent report. */
export async function markReviewed(http: HttpClient, id: string): Promise<void> {
  await http.post(reportPath(id, 'review'));
}

/** Reminds the reporter that a report is due. */
export async function remindReporter(http: HttpClient, id: string): Promise<void> {
  await http.post(reportPath(id, 'remind'));
}
