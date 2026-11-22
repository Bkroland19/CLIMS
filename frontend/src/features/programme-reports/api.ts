import { z } from 'zod';

import { parseBody, parseList, type HttpClient } from '@/lib/api';

/*
 * Programme reports from the Go API (`/api/v1/reports`, reporting requirements
 * draft v0.2). Every table on screen is the server's export of that report
 * (`/reports/export/{report}`): the same rows, columns and definitions the CSV
 * and Excel downloads carry, so a figure on screen and in a file always agree
 * (RF15, RN02). Summaries add the cards above each table.
 */

export const REPORT_KINDS = [
  'notifications',
  'warehouse-requests',
  'stock',
  'batches',
  'expiry-exceptions',
  'hmis-105',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** The report parameters a screen sets, e.g. `{ from: '2026-11-01', category: 'male' }`. */
export type ReportFilters = Readonly<Record<string, string>>;

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const reportTableSchema = z.object({
  report: z.enum(REPORT_KINDS),
  title: z.string(),
  period: z.string(),
  data_updated_at: z.string(),
  scope: z.string(),
  product: z.string(),
  rule_version: z.string(),
  filters: z.record(z.string(), z.string()),
  definitions: z.array(z.string()),
  columns: z.array(z.object({ key: z.string(), header: z.string() })),
  rows: z.array(z.record(z.string(), cell)),
});
export type ReportTable = z.infer<typeof reportTableSchema>;
export type ReportCell = z.infer<typeof cell>;

const rate = z.number().nullable();

const settingsSchema = z.object({
  review_cycle: z.string(),
  deadline_days: z.number(),
  target_percent: z.number(),
  source: z.enum(['store', 'national', 'default']),
});

export const notificationSummarySchema = z.object({
  notifications_raised: z.number(),
  notifications_fulfilled: z.number(),
  partly_received: z.number(),
  awaiting_acknowledgement: z.number(),
  awaiting_supply: z.number(),
  fulfilment_rate: rate,
  acknowledgements_through: z.string(),
  acknowledgement_overdue: z.number(),
  response: z.object({ median_hours: rate, pending: z.number() }),
  deadline: z.object({
    days: z.number(),
    target_percent: z.number(),
    on_time_rate: rate,
    target_met: z.boolean().nullable(),
    late_pending: z.number(),
  }),
  districts: z.array(
    z.object({
      district: z.string().nullable(),
      notifications_raised: z.number(),
      fulfilment_rate: rate,
    }),
  ),
  settings: settingsSchema,
});
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;

export const supplySummarySchema = z.object({
  total: z.object({
    requests: z.number(),
    requested_pieces: z.number(),
    approved_pieces: z.number(),
    issued_pieces: z.number(),
    acknowledged_pieces: z.number(),
    quantity_fulfilment_rate: rate,
    pending: z.number(),
  }),
});
export type SupplySummary = z.infer<typeof supplySummarySchema>;

export const hmisSummarySchema = z.object({
  integration_enabled: z.boolean(),
  pending_decisions: z.array(z.string()),
  total: z.object({
    ct11_female_pieces: z.number(),
    ct12_male_pieces: z.number(),
    acknowledgements: z.number(),
    unacknowledged_lines: z.number(),
  }),
});
export type HmisSummary = z.infer<typeof hmisSummarySchema>;

export const versionSchema = z.object({
  id: z.string(),
  report: z.enum(REPORT_KINDS),
  title: z.string(),
  period: z.string(),
  scope: z.string(),
  filters: z.record(z.string(), z.string()),
  data_updated_at: z.string(),
  approved_by: z.string().nullable(),
  note: z.string().nullable(),
  supersedes_id: z.string().nullable(),
  correction_reason: z.string().nullable(),
  superseded_by_id: z.string().nullable(),
  status: z.enum(['approved', 'superseded']),
  created_at: z.string(),
});
export type ReportVersion = z.infer<typeof versionSchema>;

const versionDetailSchema = versionSchema.extend({ export: reportTableSchema });
export type ReportVersionDetail = z.infer<typeof versionDetailSchema>;

/** `?a=1&b=2` for the filters that are set, in a stable order so query keys and addresses match. */
export function queryString(filters: ReportFilters, extra: ReportFilters = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra }).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function getReportTable(
  http: HttpClient,
  report: ReportKind,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<ReportTable> {
  const body = await http.get(`/reports/export/${report}${queryString(filters)}`, { signal });
  return parseBody(reportTableSchema, body, 'report table');
}

/** The report's own summary endpoint, for the reports that have cards; others have none. */
const SUMMARIES = {
  notifications: ['/reports/notifications', notificationSummarySchema],
  'warehouse-requests': ['/reports/warehouse-requests', supplySummarySchema],
  'hmis-105': ['/reports/hmis-105', hmisSummarySchema],
} as const;
export type SummaryKind = keyof typeof SUMMARIES;

export function hasSummary(report: ReportKind): report is SummaryKind {
  return report in SUMMARIES;
}

export async function getSummary<Kind extends SummaryKind>(
  http: HttpClient,
  report: Kind,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<z.infer<(typeof SUMMARIES)[Kind][1]>> {
  const [path, schema] = SUMMARIES[report];
  // The summary endpoints take the same filters, except status, which only narrows records.
  const { status: _status, ...rest } = filters;
  const body = await http.get(`${path}${queryString(rest)}`, { signal });
  return parseBody(schema, body, 'report summary') as z.infer<(typeof SUMMARIES)[Kind][1]>;
}

/** The server's CSV of a report (or of a saved version), as text with its byte order mark. */
export async function getCsv(http: HttpClient, path: string): Promise<string> {
  const body = await http.get(path);
  if (typeof body !== 'string') throw new Error('The server did not return a CSV file.');
  return body;
}

export async function listVersions(
  http: HttpClient,
  report: ReportKind | null,
  signal?: AbortSignal,
): Promise<ReportVersion[]> {
  const body = await http.get(
    `/reports/versions${queryString({ report: report ?? '', limit: '100' })}`,
    {
      signal,
    },
  );
  return parseList(versionSchema, body, 'report versions');
}

export async function getVersion(
  http: HttpClient,
  id: string,
  signal?: AbortSignal,
): Promise<ReportVersionDetail> {
  const body = await http.get(`/reports/versions/${encodeURIComponent(id)}`, { signal });
  return parseBody(versionDetailSchema, body, 'report version');
}

export async function approveVersion(
  http: HttpClient,
  input: { report: ReportKind; filters: ReportFilters; note: string },
): Promise<ReportVersionDetail> {
  const body = await http.post('/reports/versions', input);
  return parseBody(versionDetailSchema, body, 'report version');
}

export async function correctVersion(
  http: HttpClient,
  id: string,
  reason: string,
): Promise<ReportVersionDetail> {
  const body = await http.post(`/reports/versions/${encodeURIComponent(id)}/corrections`, {
    reason,
  });
  return parseBody(versionDetailSchema, body, 'report version');
}
