import { z } from 'zod';

import { startOfDay } from '@/features/audit/api';
import { parseList, type HttpClient } from '@/lib/api';
import type { StatusTone } from '@/lib/status';

/*
 * What field phones report about sending the actions they saved
 * (`backend/internal/features/synclog`, `docs/modules/sync-log.md`).
 *
 *   GET /sync-log?user_id=&action=&status=&client_entry_id=&from=&to=&limit=&offset=
 *     → SyncLogEntry[], most recently saved first. Needs `sync_logs:read`.
 *
 * Entries are the phone's account. Times are the phone's clock, which may be wrong.
 */

export const PAGE_SIZE = 50;

export const SYNC_STATUSES = ['waiting', 'retrying', 'sent', 'refused', 'saved_on_phone'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_ACTIONS = [
  'mapHotspot',
  'stockout',
  'acknowledge',
  'pickup',
  'deliver',
  'confirmReceipt',
  'notify',
] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

const attemptSchema = z.object({
  at: z.string(),
  http_status: z.number().nullable(),
  /** A short code such as `network` or `http_409`; null when the try succeeded. */
  error: z.string().nullable(),
});
export type SyncAttempt = z.infer<typeof attemptSchema>;

const entrySchema = z.object({
  id: z.string(),
  client_entry_id: z.string(),
  user: z.object({ id: z.string(), username: z.string(), roles: z.array(z.string()) }),
  action: z.enum(SYNC_ACTIONS),
  status: z.enum(SYNC_STATUSES),
  server_record_id: z.string().nullable(),
  queued_at: z.string(),
  changed_at: z.string(),
  attempt_count: z.number(),
  attempts: z.array(attemptSchema),
  last_error: z.string().nullable(),
  device: z.object({
    platform: z.enum(['android', 'ios']),
    os_version: z.string(),
    app_version: z.string(),
  }),
  received_at: z.string(),
});
export type SyncLogEntry = z.infer<typeof entrySchema>;

export interface SyncLogFilters {
  status: SyncStatus | null;
  action: SyncAction | null;
  /** A field user's ID. */
  user: string | null;
  /** First day the actions were saved, `YYYY-MM-DD` in the browser's time zone. */
  from: string | null;
  /** Last day, inclusive. */
  to: string | null;
}

export const NO_FILTERS: SyncLogFilters = {
  status: null,
  action: null,
  user: null,
  from: null,
  to: null,
};

/** The API query for a set of filters and a page. */
export function syncLogQuery(filters: SyncLogFilters, offset = 0): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.action) params.set('action', filters.action);
  if (filters.user) params.set('user_id', filters.user);
  const from = filters.from && startOfDay(filters.from);
  // The API's `to` is exclusive: the day after the last one shown.
  const to = filters.to && startOfDay(filters.to, 1);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', String(PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  return params;
}

export async function listSyncLog(
  http: HttpClient,
  filters: SyncLogFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<SyncLogEntry[]> {
  return parseList(
    entrySchema,
    await http.get(`/sync-log?${syncLogQuery(filters, offset).toString()}`, { signal }),
    'sync log',
  );
}

// ---------------------------------------------------------------- wording

const STATUS_WORDING: Record<SyncStatus, { label: string; tone: StatusTone; meaning: string }> = {
  waiting: { label: 'Waiting', tone: 'neutral', meaning: 'Saved on the phone, not tried yet' },
  retrying: {
    label: 'Retrying',
    tone: 'caution',
    meaning: 'The last try did not reach the server; the phone tries again when it reconnects',
  },
  sent: { label: 'Sent', tone: 'positive', meaning: 'The server accepted it' },
  refused: {
    label: 'Refused',
    tone: 'negative',
    meaning: 'The server rejected it and the user was told on the phone',
  },
  saved_on_phone: {
    label: 'Saved on phone',
    tone: 'info',
    meaning: 'The server has no endpoint for this action yet, so only the phone changed',
  },
};

export const statusLabel = (status: SyncStatus) => STATUS_WORDING[status].label;
export const statusTone = (status: SyncStatus) => STATUS_WORDING[status].tone;
export const statusMeaning = (status: SyncStatus) => STATUS_WORDING[status].meaning;

const ACTION_LABELS: Record<SyncAction, string> = {
  mapHotspot: 'Hotspot mapped',
  stockout: 'Stock requested',
  acknowledge: 'Delivery counted',
  pickup: 'Trip started',
  deliver: 'Delivered',
  confirmReceipt: 'Receipt confirmed',
  notify: 'Notified district',
};

export const actionLabel = (action: SyncAction) => ACTION_LABELS[action];

const ERROR_LABELS: Record<string, string> = {
  network: 'No network',
  timeout: 'Timed out',
  unknown: 'Unknown error',
  http_400: 'Bad request (400)',
  http_401: 'Signed out (401)',
  http_403: 'Not allowed (403)',
  http_404: 'Not found (404)',
  http_409: 'Conflict (409)',
  http_422: 'Details not accepted (422)',
  http_429: 'Too many requests (429)',
};

/** "No network", "Conflict (409)", "Server error (502)". */
export function errorLabel(code: string): string {
  const known = ERROR_LABELS[code];
  if (known) return known;
  const status = /^http_(\d{3})$/.exec(code)?.[1];
  if (status) return Number(status) >= 500 ? `Server error (${status})` : `HTTP ${status}`;
  return code;
}

/** "Android 14 · app 2.2.1". */
export function deviceLabel(device: SyncLogEntry['device']): string {
  const platform = device.platform === 'ios' ? 'iOS' : 'Android';
  const os = device.os_version ? `${platform} ${device.os_version}` : platform;
  return device.app_version ? `${os} · app ${device.app_version}` : os;
}
